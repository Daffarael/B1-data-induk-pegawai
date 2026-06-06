
const db = require('../lib/db');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { parse } = require('csv-parse');
const path = require('path');

// ─── Multer config ───
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') return cb(new Error('Hanya file CSV yang diizinkan'));
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur — Daftar nomenklatur + search + pagination
// ────────────────────────────────────────────────────────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const page   = parseInt(req.query.page) || 1;
    const limit  = 10;
    const offset = (page - 1) * limit;

    const likeParam = `%${search}%`;
    const where = search ? 'WHERE n.name LIKE ? OR n.grade LIKE ?' : '';
    const params = search ? [likeParam, likeParam] : [];

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM nomenclatures n ${where}`, params
    );
    const totalPages = Math.ceil(total / limit);

    // Stat: total nomenklatur + total klasifikasi
    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM nomenclatures) AS totalNomenklatur,
        (SELECT COUNT(*) FROM nomenclature_classifications) AS totalKlasifikasi
    `);

    const [nomenklatur] = await db.query(
      `SELECT n.id, n.name, n.grade,
              COUNT(nc.id) AS jumlah_klasifikasi
       FROM nomenclatures n
       LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
       ${where}
       GROUP BY n.id
       ORDER BY n.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('nomenklatur/index', {
      title: 'Nomenklatur Jabatan',
      nomenklatur,
      search,
      currentPage: page,
      totalPages,
      total,
      totalNomenklatur: stats.totalNomenklatur,
      totalKlasifikasi: stats.totalKlasifikasi
    });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/:id — Detail + daftar klasifikasi
// ────────────────────────────────────────────────────────────────────
const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[nom]] = await db.query('SELECT * FROM nomenclatures WHERE id = ?', [id]);
    if (!nom) return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });

    const [klasifikasi] = await db.query(
      'SELECT * FROM nomenclature_classifications WHERE nomenclature_id = ? ORDER BY name ASC', [id]
    );

    res.render('nomenklatur/show', {
      title: `Detail — ${nom.name}`,
      nom,
      klasifikasi
    });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/create
// ────────────────────────────────────────────────────────────────────
const create = (req, res) => {
  res.render('nomenklatur/create', { title: 'Tambah Nomenklatur', old: {}, errors: [] });
};

// ────────────────────────────────────────────────────────────────────
// POST /nomenklatur — Simpan nomenklatur baru
// ────────────────────────────────────────────────────────────────────
const store = async (req, res, next) => {
  const { name, qualification, duties, grade } = req.body;
  const errors = [];
  if (!name?.trim())          errors.push('Nama nomenklatur wajib diisi');
  if (!qualification?.trim()) errors.push('Kualifikasi wajib diisi');
  if (!duties?.trim())        errors.push('Uraian tugas wajib diisi');
  if (!grade?.trim())         errors.push('Golongan/Grade wajib diisi');

  if (errors.length > 0) {
    return res.status(422).render('nomenklatur/create', {
      title: 'Tambah Nomenklatur', errors, old: req.body
    });
  }

  try {
    await db.query(
      'INSERT INTO nomenclatures (name, qualification, duties, grade, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [name.trim(), qualification.trim(), duties.trim(), grade.trim()]
    );
    req.flash('success', `Nomenklatur "${name}" berhasil ditambahkan`);
    res.redirect('/nomenklatur');
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/:id/edit
// ────────────────────────────────────────────────────────────────────
const edit = async (req, res, next) => {
  try {
    const [[nom]] = await db.query('SELECT * FROM nomenclatures WHERE id = ?', [req.params.id]);
    if (!nom) return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    res.render('nomenklatur/edit', { title: `Edit — ${nom.name}`, nom, errors: [] });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// PUT /nomenklatur/:id — Update nomenklatur
// ────────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  const { id } = req.params;
  const { name, qualification, duties, grade } = req.body;
  const errors = [];
  if (!name?.trim())          errors.push('Nama nomenklatur wajib diisi');
  if (!qualification?.trim()) errors.push('Kualifikasi wajib diisi');
  if (!duties?.trim())        errors.push('Uraian tugas wajib diisi');
  if (!grade?.trim())         errors.push('Golongan/Grade wajib diisi');

  if (errors.length > 0) {
    const [[nom]] = await db.query('SELECT * FROM nomenclatures WHERE id = ?', [id]);
    return res.status(422).render('nomenklatur/edit', {
      title: 'Edit Nomenklatur', nom: { ...nom, ...req.body, id }, errors
    });
  }

  try {
    await db.query(
      'UPDATE nomenclatures SET name=?, qualification=?, duties=?, grade=?, updated_at=NOW() WHERE id=?',
      [name.trim(), qualification.trim(), duties.trim(), grade.trim(), id]
    );
    req.flash('success', `Nomenklatur "${name}" berhasil diperbarui`);
    res.redirect('/nomenklatur/' + id);
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// DELETE /nomenklatur/:id — Hapus nomenklatur (cascade ke klasifikasi)
// ────────────────────────────────────────────────────────────────────
const destroy = async (req, res, next) => {
  const { id } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[nom]] = await conn.query('SELECT name FROM nomenclatures WHERE id = ?', [id]);
    if (!nom) { await conn.rollback(); return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' }); }

    // Cek apakah digunakan oleh staff
    const [[{ cnt }]] = await conn.query(
      'SELECT COUNT(*) as cnt FROM staff_nomenclature_histories WHERE nomenclature_id = ?', [id]
    );
    if (cnt > 0) {
      await conn.rollback();
      req.flash('error', 'Nomenklatur tidak dapat dihapus karena masih digunakan di riwayat jabatan staf');
      return res.redirect('/nomenklatur');
    }

    await conn.query('DELETE FROM nomenclature_classifications WHERE nomenclature_id = ?', [id]);
    await conn.query('DELETE FROM nomenclatures WHERE id = ?', [id]);
    await conn.commit();
    req.flash('success', `Nomenklatur "${nom.name}" berhasil dihapus`);
    res.redirect('/nomenklatur');
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
};

// ────────────────────────────────────────────────────────────────────
// POST /nomenklatur/:id/klasifikasi — Tambah klasifikasi
// ────────────────────────────────────────────────────────────────────
const storeKlasifikasi = async (req, res, next) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name?.trim()) {
    req.flash('error', 'Nama klasifikasi wajib diisi');
    return res.redirect('/nomenklatur/' + id);
  }
  try {
    await db.query(
      'INSERT INTO nomenclature_classifications (nomenclature_id, name, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
      [id, name.trim(), description?.trim() || null]
    );
    req.flash('success', 'Klasifikasi berhasil ditambahkan');
    res.redirect('/nomenklatur/' + id);
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// POST /nomenklatur/:id/klasifikasi/:kid — Update klasifikasi
// ────────────────────────────────────────────────────────────────────
const updateKlasifikasi = async (req, res, next) => {
  const { id, kid } = req.params;
  const { name, description } = req.body;
  if (!name?.trim()) {
    req.flash('error', 'Nama klasifikasi wajib diisi');
    return res.redirect('/nomenklatur/' + id);
  }
  try {
    await db.query(
      'UPDATE nomenclature_classifications SET name=?, description=?, updated_at=NOW() WHERE id=? AND nomenclature_id=?',
      [name.trim(), description?.trim() || null, kid, id]
    );
    req.flash('success', 'Klasifikasi berhasil diperbarui');
    res.redirect('/nomenklatur/' + id);
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// DELETE /nomenklatur/:id/klasifikasi/:kid — Hapus klasifikasi
// ────────────────────────────────────────────────────────────────────
const destroyKlasifikasi = async (req, res, next) => {
  const { id, kid } = req.params;
  try {
    await db.query('DELETE FROM nomenclature_classifications WHERE id=? AND nomenclature_id=?', [kid, id]);
    req.flash('success', 'Klasifikasi berhasil dihapus');
    res.redirect('/nomenklatur/' + id);
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/export/pdf
// ────────────────────────────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const where = search ? 'WHERE n.name LIKE ? OR n.grade LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(
      `SELECT n.*, COUNT(nc.id) AS jumlah_klasifikasi
       FROM nomenclatures n
       LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
       ${where}
       GROUP BY n.id ORDER BY n.name ASC`, params
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nomenklatur-jabatan.pdf"');
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('DAFTAR NOMENKLATUR JABATAN', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('FacultyWare — Fakultas Teknologi Informasi', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'right' });
    doc.moveDown();

    const colWidths = [180, 80, 80, 140];
    const headers = ['Nama Nomenklatur', 'Golongan', 'Jml Klasifikasi', 'Kualifikasi'];
    let x = 40;
    const headerY = doc.y;

    doc.rect(40, headerY, colWidths.reduce((a, b) => a + b, 0), 18).fill('#2563eb');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x + 3, headerY + 4, { width: colWidths[i] - 6 });
      x += colWidths[i];
    });

    doc.fillColor('black').font('Helvetica').fontSize(8);
    let rowY = headerY + 18;

    rows.forEach((r, idx) => {
      const rowH = 18;
      if (idx % 2 === 0) doc.rect(40, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#f1f5f9');
      doc.fillColor('black');
      x = 40;
      const values = [r.name, r.grade, String(r.jumlah_klasifikasi), r.qualification?.substring(0, 60) || '-'];
      values.forEach((v, i) => { doc.text(v, x + 3, rowY + 4, { width: colWidths[i] - 6 }); x += colWidths[i]; });
      rowY += rowH;
      if (rowY > doc.page.height - 60) { doc.addPage(); rowY = 40; }
    });

    doc.moveDown(2).fontSize(8).text(`Total: ${rows.length} nomenklatur`, 40);
    doc.end();
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// POST /nomenklatur/import — Import dari CSV
// ────────────────────────────────────────────────────────────────────
const importCsv = async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'File CSV wajib dipilih');
    return res.redirect('/nomenklatur');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const conn = await db.getConnection();
  try {
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, data) => {
        if (err) reject(err); else resolve(data);
      });
    });

    if (records.length === 0) { req.flash('error', 'File CSV kosong'); return res.redirect('/nomenklatur'); }

    const requiredCols = ['name', 'qualification', 'duties', 'grade'];
    const missing = requiredCols.filter(c => !(c in records[0]));
    if (missing.length > 0) {
      req.flash('error', `Kolom wajib tidak ditemukan: ${missing.join(', ')}`);
      return res.redirect('/nomenklatur');
    }

    await conn.beginTransaction();
    let imported = 0, skipped = 0;
    for (const row of records) {
      if (!row.name?.trim()) { skipped++; continue; }
      await conn.query(
        'INSERT INTO nomenclatures (name, qualification, duties, grade, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [row.name.trim(), row.qualification || '', row.duties || '', row.grade || '']
      );
      imported++;
    }
    await conn.commit();
    req.flash('success', `Import selesai: ${imported} berhasil, ${skipped} dilewati`);
    res.redirect('/nomenklatur');
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
};

module.exports = {
  index, show, create, store, edit, update, destroy,
  storeKlasifikasi, updateKlasifikasi, destroyKlasifikasi,
  exportPdf, importCsv, upload
};