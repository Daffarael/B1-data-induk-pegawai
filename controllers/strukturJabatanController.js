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

            const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
            res.setHeader('Content-Disposition', 'attachment; filename="Data_Struktur_Jabatan.pdf"');
            res.setHeader('Content-Type', 'application/pdf');
            doc.pipe(res);

            const W = doc.page.width, H = doc.page.height;
            const ML = 45, MR = 45;
            const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            const logoPath = path.join(__dirname, '../public/assets/images/logo-fti.png');
            const C_DARK = '#1f2937', C_GRAY = '#6b7280', C_LINE = '#e5e7eb', C_STRIPE = '#f9fafb', C_HEAD = '#374151';

            const drawPageHeader = () => {
                const KOP_H = 90;
                try { doc.image(logoPath, ML, 14, { height: 58 }); } catch (e) {
                    doc.rect(ML, 14, 58, 58).fill(C_HEAD);
                    doc.fillColor('white').fontSize(11).font('Helvetica-Bold').text('FTI', ML, 34, { width: 58, align: 'center' });
                }
                const textX = ML + 68;
                doc.fillColor(C_GRAY).fontSize(7).font('Helvetica').text('KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI', textX, 15, { characterSpacing: 0.2 });
                doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text('UNIVERSITAS ANDALAS', textX, 25);
                doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold').text('FAKULTAS TEKNOLOGI INFORMASI', textX, 37);
                doc.fillColor(C_GRAY).fontSize(7).font('Helvetica').text('Kampus Unand Limau Manis, Padang 25163, Telp. (0751) 72586', textX, 50);
                doc.fillColor(C_GRAY).fontSize(7).text('Website: fti.unand.ac.id  |  Email: fti@unand.ac.id', textX, 60);
                doc.moveTo(ML, KOP_H - 4).lineTo(W - MR, KOP_H - 4).strokeColor(C_DARK).lineWidth(2).stroke();
                doc.moveTo(ML, KOP_H).lineTo(W - MR, KOP_H).strokeColor(C_DARK).lineWidth(0.5).stroke();
                doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('DAFTAR JABATAN STRUKTURAL', 0, KOP_H + 10, { width: W, align: 'center' });
                doc.fillColor(C_GRAY).fontSize(7.5).font('Helvetica').text('Fakultas Teknologi Informasi, Universitas Andalas', 0, KOP_H + 25, { width: W, align: 'center' });
                doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
                    .text(`Dicetak: ${tanggal}`, 0, 22, { width: W - MR, align: 'right' })
                    .text(`Total Data: ${rows.length} jabatan`, 0, 33, { width: W - MR, align: 'right' });
                return KOP_H + 36;
            };

            const colWidths = [220, 70, 180, 220];
            const headers = ['Nama Jabatan', 'Golongan', 'Jabatan Atasan', 'Kualifikasi'];
            const totalTableW = colWidths.reduce((a, b) => a + b, 0);
            const ROW_H = 18, HEAD_H = 20, pageBottom = H - 36;

            const drawTableHeader = (y) => {
                doc.rect(ML, y, totalTableW, HEAD_H).fill(C_HEAD);
                doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
                let cx = ML;
                headers.forEach((h, i) => { doc.text(h, cx + 5, y + 6, { width: colWidths[i] - 8 }); cx += colWidths[i]; });
                return y + HEAD_H;
            };

            const drawRow = (r, idx, y) => {
                if (idx % 2 !== 0) doc.rect(ML, y, totalTableW, ROW_H).fill(C_STRIPE);
                doc.moveTo(ML, y + ROW_H).lineTo(ML + totalTableW, y + ROW_H).strokeColor(C_LINE).lineWidth(0.3).stroke();
                const values = [r.name, r.grade || '-', r.parent_name || '-', r.qualification?.substring(0, 60) || '-'];
                let cx = ML;
                values.forEach((v, i) => {
                    doc.fillColor(C_DARK).fontSize(7.5).font('Helvetica').text(String(v), cx + 5, y + 5, { width: colWidths[i] - 8 });
                    cx += colWidths[i];
                });
            };

            const drawTableBorder = (yT, yB) => doc.rect(ML, yT, totalTableW, yB - yT).strokeColor('#d1d5db').lineWidth(0.5).stroke();
            const drawColLines = (yT, yB) => {
                let cx = ML;
                colWidths.forEach((w, i) => { cx += w; if (i < colWidths.length - 1) doc.moveTo(cx, yT).lineTo(cx, yB).strokeColor(C_LINE).lineWidth(0.3).stroke(); });
            };
            const drawFooter = (pageNum) => {
                doc.moveTo(ML, H - 22).lineTo(W - MR, H - 22).strokeColor('#d1d5db').lineWidth(0.4).stroke();
                doc.fillColor(C_GRAY).fontSize(6.5).font('Helvetica')
                    .text('FacultyWare | Sistem Informasi Kepegawaian FTI Universitas Andalas', ML, H - 17)
                    .text(`Halaman ${pageNum}  |  ${tanggal}`, 0, H - 17, { width: W - MR, align: 'right' });
            };

            let startY = drawPageHeader(), tableTopY = startY;
            let rowY = drawTableHeader(startY), pageNum = 1;

            rows.forEach((r, idx) => {
                if (rowY + ROW_H > pageBottom) {
                    drawTableBorder(tableTopY, rowY); drawColLines(tableTopY, rowY); drawFooter(pageNum++);
                    doc.addPage(); startY = drawPageHeader(); tableTopY = startY; rowY = drawTableHeader(startY);
                }
                drawRow(r, idx, rowY); rowY += ROW_H;
            });

            drawTableBorder(tableTopY, rowY); drawColLines(tableTopY, rowY); drawFooter(pageNum);
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
    },

    // GET /struktur-jabatan/export/json
    exportJson: async (req, res, next) => {
        try {
            const [rows] = await db.query(`
                SELECT s.id, s.name, s.grade, s.qualification, s.description,
                       p.name AS parent_name,
                       COUNT(jr.id) AS jumlah_tupoksi
                FROM structural_positions s
                LEFT JOIN structural_positions p ON s.parent_id = p.id
                LEFT JOIN job_responsibilities jr ON jr.structural_position_id = s.id
                GROUP BY s.id
                ORDER BY s.name ASC
            `);

            const output = {
                exported_at: new Date().toISOString(),
                total: rows.length,
                data: rows
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="data-struktur-jabatan.json"');
            res.send(JSON.stringify(output, null, 2));
        } catch (err) {
            if (next) next(err);
            else { req.flash('error', 'Gagal export JSON: ' + err.message); res.redirect('/struktur-jabatan'); }
        }
    }
};