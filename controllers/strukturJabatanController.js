const db = require('../lib/db');
const PDFDocument = require('pdfkit');
const { parse } = require('csv-parse');
const path = require('path');
const multer = require('multer');

// Setup Multer untuk Upload CSV
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv') return cb(new Error('Hanya file CSV yang diizinkan'));
        cb(null, true);
    },
    limits: { fileSize: 2 * 1024 * 1024 }
});

module.exports = {
    upload,

    // 1. GET /struktur-jabatan (Halaman Daftar & API)
    index: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 10;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';

            let query = `
        SELECT s.*, p.name as parent_name, 
        (SELECT COUNT(*) FROM job_responsibilities jr WHERE jr.structural_position_id = s.id) as count_tupoksi 
        FROM structural_positions s
        LEFT JOIN structural_positions p ON s.parent_id = p.id
      `;
            let countQuery = `SELECT COUNT(*) as total FROM structural_positions s LEFT JOIN structural_positions p ON s.parent_id = p.id`;
            let params = [];

            if (search) {
                query += ` WHERE s.name LIKE ? OR s.grade LIKE ? OR p.name LIKE ?`;
                countQuery += ` WHERE s.name LIKE ? OR s.grade LIKE ? OR p.name LIKE ?`;
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }

            query += ` ORDER BY s.name ASC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const [rows] = await db.query(query, params);
            const [countResult] = await db.query(countQuery, search ? [params[0], params[1], params[2]] : []);

            const total = countResult[0].total;
            const totalPages = Math.ceil(total / limit);

            // Hitung total untuk stat card
            const [statTotal] = await db.query('SELECT COUNT(*) as total FROM structural_positions');
            const [statTupoksi] = await db.query('SELECT COUNT(*) as total FROM job_responsibilities');

            if (req.originalUrl.startsWith('/api')) {
                return res.json({
                    status: 'success',
                    data: rows,
                    meta: { page, limit, total, totalPages }
                });
            }

            res.render('struktur_jabatan/index', {
                title: 'Data Struktur Jabatan',
                jabatan: rows,
                currentPage: page,
                totalPages,
                total,
                search,
                totalJabatan: statTotal[0].total,
                totalTupoksi: statTupoksi[0].total
            });
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal memuat data struktur jabatan: ' + err.message);
            res.redirect('/dashboard');
        }
    },

    // 2. GET /struktur-jabatan/create (Halaman Form Tambah)
    create: async (req, res) => {
        try {
            const [parents] = await db.query('SELECT id, name FROM structural_positions ORDER BY name ASC');
            res.render('struktur_jabatan/create', {
                title: 'Tambah Jabatan Struktural',
                parents,
                old: {}
            });
        } catch (err) {
            req.flash('error', 'Gagal memuat form: ' + err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    // 3. POST /struktur-jabatan (Proses Simpan Baru & API)
    store: async (req, res) => {
        const { name, parent_id, grade, qualification, description } = req.body;
        let errors = [];
        if (!name) errors.push('Nama jabatan wajib diisi.');
        if (!grade) errors.push('Golongan/Grade wajib diisi.');

        if (errors.length > 0) {
            if (req.originalUrl.startsWith('/api')) return res.status(400).json({ status: 'error', errors });
            req.flash('error', errors.join(' '));
            const [parents] = await db.query('SELECT id, name FROM structural_positions ORDER BY name ASC');
            return res.render('struktur_jabatan/create', { title: 'Tambah Jabatan Struktural', parents, old: req.body, errors });
        }

        try {
            // Set structural_position_id ke 1 sebagai default bypass
            const pId = parent_id ? parent_id : null;
            await db.query(
                'INSERT INTO structural_positions (name, parent_id, grade, qualification, description, structural_position_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())',
                [name, pId, grade, qualification, description]
            );

            if (req.originalUrl.startsWith('/api')) return res.status(201).json({ status: 'success', message: 'Jabatan ditambahkan.' });
            req.flash('success', 'Data jabatan struktural berhasil ditambahkan.');
            res.redirect('/struktur-jabatan');
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal menyimpan: ' + err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    // 4. GET /struktur-jabatan/:id (Detail + Tupoksi)
    show: async (req, res) => {
        try {
            const [jabatan] = await db.query(`
        SELECT s.*, p.name as parent_name 
        FROM structural_positions s 
        LEFT JOIN structural_positions p ON s.parent_id = p.id 
        WHERE s.id = ?
      `, [req.params.id]);

            if (jabatan.length === 0) {
                if (req.originalUrl.startsWith('/api')) return res.status(404).json({ error: 'Jabatan tidak ditemukan' });
                req.flash('error', 'Data jabatan tidak ditemukan.');
                return res.redirect('/struktur-jabatan');
            }

            // Ambil Tupoksi
            const [tupoksi] = await db.query('SELECT * FROM job_responsibilities WHERE structural_position_id = ? ORDER BY `order` ASC, id ASC', [req.params.id]);

            // Ambil bawahan
            const [bawahan] = await db.query('SELECT id, name, grade FROM structural_positions WHERE parent_id = ? ORDER BY name ASC', [req.params.id]);

            if (req.originalUrl.startsWith('/api')) {
                return res.json({ status: 'success', data: { jabatan: jabatan[0], tupoksi, bawahan } });
            }

            res.render('struktur_jabatan/show', {
                title: 'Detail Jabatan',
                jabatan: jabatan[0],
                tupoksi,
                bawahan
            });
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal memuat detail: ' + err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    // 5. GET /struktur-jabatan/:id/edit
    edit: async (req, res) => {
        try {
            const [jabatan] = await db.query('SELECT * FROM structural_positions WHERE id = ?', [req.params.id]);
            if (jabatan.length === 0) {
                req.flash('error', 'Jabatan tidak ditemukan.');
                return res.redirect('/struktur-jabatan');
            }

            const [parents] = await db.query('SELECT id, name FROM structural_positions WHERE id != ? ORDER BY name ASC', [req.params.id]);

            res.render('struktur_jabatan/edit', {
                title: 'Edit Jabatan',
                jabatan: jabatan[0],
                parents
            });
        } catch (err) {
            req.flash('error', 'Gagal memuat form edit: ' + err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    // 6. PUT /struktur-jabatan/:id
    update: async (req, res) => {
        const { name, parent_id, grade, qualification, description } = req.body;
        try {
            const pId = parent_id ? parent_id : null;
            await db.query(
                'UPDATE structural_positions SET name=?, parent_id=?, grade=?, qualification=?, description=?, updated_at=NOW() WHERE id=?',
                [name, pId, grade, qualification, description, req.params.id]
            );

            if (req.originalUrl.startsWith('/api')) return res.json({ status: 'success', message: 'Jabatan diperbarui.' });
            req.flash('success', 'Data jabatan berhasil diperbarui.');
            res.redirect('/struktur-jabatan/' + req.params.id);
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal memperbarui: ' + err.message);
            res.redirect('/struktur-jabatan/' + req.params.id + '/edit');
        }
    },

    // 7. DELETE /struktur-jabatan/:id
    destroy: async (req, res) => {
        try {
            // Cek apakah punya bawahan
            const [bawahan] = await db.query('SELECT id FROM structural_positions WHERE parent_id = ? LIMIT 1', [req.params.id]);
            if (bawahan.length > 0) {
                throw new Error('Tidak bisa dihapus karena masih menjadi atasan dari jabatan lain.');
            }

            // Cek tupoksi
            const [tupoksi] = await db.query('SELECT id FROM job_responsibilities WHERE structural_position_id = ? LIMIT 1', [req.params.id]);
            if (tupoksi.length > 0) {
                throw new Error('Hapus semua Tupoksi terlebih dahulu sebelum menghapus jabatan.');
            }

            await db.query('DELETE FROM structural_positions WHERE id = ?', [req.params.id]);

            if (req.originalUrl.startsWith('/api')) return res.json({ status: 'success', message: 'Jabatan dihapus.' });
            req.flash('success', 'Data jabatan berhasil dihapus.');
            res.redirect('/struktur-jabatan');
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(400).json({ error: err.message });
            req.flash('error', err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    // ----------------------------------------------------------------------
    // MANAJEMEN TUPOKSI (JOB RESPONSIBILITIES)
    // ----------------------------------------------------------------------

    storeTupoksi: async (req, res) => {
        const { title, description, type, order } = req.body;
        try {
            await db.query(
                'INSERT INTO job_responsibilities (structural_position_id, title, description, type, `order`, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                [req.params.id, title, description, type, order || 0]
            );
            if (req.originalUrl.startsWith('/api')) return res.status(201).json({ status: 'success' });
            req.flash('success', 'Tupoksi berhasil ditambahkan.');
            res.redirect('/struktur-jabatan/' + req.params.id);
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal menambah tupoksi: ' + err.message);
            res.redirect('/struktur-jabatan/' + req.params.id);
        }
    },

    updateTupoksi: async (req, res) => {
        const { title, description, type, order } = req.body;
        try {
            await db.query(
                'UPDATE job_responsibilities SET title=?, description=?, type=?, `order`=?, updated_at=NOW() WHERE id=? AND structural_position_id=?',
                [title, description, type, order || 0, req.params.tupoksi_id, req.params.id]
            );
            if (req.originalUrl.startsWith('/api')) return res.json({ status: 'success' });
            req.flash('success', 'Tupoksi berhasil diperbarui.');
            res.redirect('/struktur-jabatan/' + req.params.id);
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal memperbarui tupoksi: ' + err.message);
            res.redirect('/struktur-jabatan/' + req.params.id);
        }
    },

    destroyTupoksi: async (req, res) => {
        try {
            await db.query('DELETE FROM job_responsibilities WHERE id=? AND structural_position_id=?', [req.params.tupoksi_id, req.params.id]);
            if (req.originalUrl.startsWith('/api')) return res.json({ status: 'success' });
            req.flash('success', 'Tupoksi dihapus.');
            res.redirect('/struktur-jabatan/' + req.params.id);
        } catch (err) {
            if (req.originalUrl.startsWith('/api')) return res.status(500).json({ error: err.message });
            req.flash('error', 'Gagal menghapus tupoksi: ' + err.message);
            res.redirect('/struktur-jabatan/' + req.params.id);
        }
    },

    // ----------------------------------------------------------------------
    // EXPORT & IMPORT
    // ----------------------------------------------------------------------

    exportPdf: async (req, res) => {
        try {
            const search = req.query.search || '';
            let query = `SELECT s.*, p.name as parent_name FROM structural_positions s LEFT JOIN structural_positions p ON s.parent_id = p.id`;
            let params = [];
            if (search) {
                query += ` WHERE s.name LIKE ? OR s.grade LIKE ?`;
                params.push(`%${search}%`, `%${search}%`);
            }
            query += ` ORDER BY s.name ASC`;
            const [rows] = await db.query(query, params);

            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            res.setHeader('Content-disposition', 'attachment; filename="Data_Struktur_Jabatan.pdf"');
            res.setHeader('Content-type', 'application/pdf');
            doc.pipe(res);

            doc.fontSize(16).text('Data Struktur Jabatan', { align: 'center' }).moveDown();
            rows.forEach((r, i) => {
                doc.fontSize(11).text(`${i + 1}. ${r.name}`);
                doc.fontSize(9).text(`   Golongan: ${r.grade}`);
                doc.fontSize(9).text(`   Atasan: ${r.parent_name || '-'}`);
                doc.moveDown(0.5);
            });
            doc.end();
        } catch (err) {
            req.flash('error', 'Gagal export PDF: ' + err.message);
            res.redirect('/struktur-jabatan');
        }
    },

    importCsv: async (req, res) => {
        if (!req.file) {
            req.flash('error', 'File CSV tidak ditemukan.');
            return res.redirect('/struktur-jabatan');
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const conn = await db.getConnection();

        try {
            const records = await new Promise((resolve, reject) => {
                parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, data) => {
                    if (err) reject(err); else resolve(data);
                });
            });

            if (records.length === 0) { req.flash('error', 'File CSV kosong'); return res.redirect('/struktur-jabatan'); }

            const requiredCols = ['name', 'grade'];
            const missing = requiredCols.filter(c => !(c in records[0]));
            if (missing.length > 0) {
                req.flash('error', `Kolom wajib tidak ditemukan: ${missing.join(', ')}`);
                return res.redirect('/struktur-jabatan');
            }

            await conn.beginTransaction();
            let imported = 0, skipped = 0;
            for (const row of records) {
                if (!row.name?.trim()) { skipped++; continue; }
                await conn.query(
                    'INSERT INTO structural_positions (name, grade, qualification, description, structural_position_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())',
                    [row.name.trim(), row.grade.trim(), row.qualification || '', row.description || '']
                );
                imported++;
            }

            await conn.commit();
            req.flash('success', `Import selesai: ${imported} data berhasil diimpor, ${skipped} dilewati.`);
            res.redirect('/struktur-jabatan');
        } catch (err) {
            await conn.rollback();
            req.flash('error', 'Error saat import: ' + err.message);
            res.redirect('/struktur-jabatan');
        } finally {
            conn.release();
        }
    }
};