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
// GET /nomenklatur - Daftar nomenklatur + search + pagination
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
// GET /nomenklatur/:id - Detail + daftar klasifikasi
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
      title: `Detail - ${nom.name}`,
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
// POST /nomenklatur - Simpan nomenklatur baru
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
    res.render('nomenklatur/edit', { title: `Edit - ${nom.name}`, nom, errors: [] });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// PUT /nomenklatur/:id - Update nomenklatur
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
// DELETE /nomenklatur/:id - Hapus nomenklatur (cascade ke klasifikasi)
// ────────────────────────────────────────────────────────────────────
const destroy = async (req, res, next) => {
  const { id } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[nom]] = await conn.query('SELECT name FROM nomenclatures WHERE id = ?', [id]);
    if (!nom) { await conn.rollback(); return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' }); }

    // Cek apakah digunakan oleh staff (lewat klasifikasi)
    const [[{ cnt }]] = await conn.query(
      `SELECT COUNT(*) as cnt FROM staff_nomenclature_histories
       WHERE nomenclature_class_id IN (
         SELECT id FROM nomenclature_classifications WHERE nomenclature_id = ?
       )`, [id]
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
// POST /nomenklatur/:id/klasifikasi - Tambah klasifikasi
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
// POST /nomenklatur/:id/klasifikasi/:kid - Update klasifikasi
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
// DELETE /nomenklatur/:id/klasifikasi/:kid - Hapus klasifikasi
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
// GET /nomenklatur/export/pdf/preview  — Preview halaman PDF
// ────────────────────────────────────────────────────────────────────
const previewPdf = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const where = search ? 'WHERE n.name LIKE ? OR n.grade LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const [nomenklatur] = await db.query(
      `SELECT n.id, n.name, n.grade, n.qualification, n.duties,
              COUNT(nc.id) AS jumlah_klasifikasi
       FROM nomenclatures n
       LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
       ${where}
       GROUP BY n.id ORDER BY n.name ASC`, params
    );

    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const downloadUrl = `/nomenklatur/export/pdf?search=${encodeURIComponent(search)}`;

    res.locals.layout = 'layouts/preview';
    res.render('nomenklatur/preview-pdf', {
      title: 'Preview PDF — Nomenklatur Jabatan',
      nomenklatur,
      search,
      tanggal,
      downloadUrl
    });
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

    const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nomenklatur-jabatan.pdf"');
    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;
    const ML = 45, MR = 45;
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoPath = path.join(__dirname, '../public/assets/images/logo-fti.png');

    const C_DARK = '#1f2937', C_GRAY = '#6b7280', C_LINE = '#e5e7eb';
    const C_STRIPE = '#f9fafb', C_HEAD = '#374151';

    const drawPageHeader = () => {
      const KOP_H = 90;
      try { doc.image(logoPath, ML, 14, { height: 58 }); } catch(e) {
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
      doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('DAFTAR NOMENKLATUR JABATAN', 0, KOP_H + 10, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7.5).font('Helvetica').text('Fakultas Teknologi Informasi, Universitas Andalas', 0, KOP_H + 25, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text(`Dicetak: ${tanggal}`, 0, 22, { width: W - MR, align: 'right' })
         .text(`Total Data: ${rows.length} nomenklatur`, 0, 33, { width: W - MR, align: 'right' });
      return KOP_H + 36;
    };

    const colWidths = [220, 80, 80, 180];
    const headers = ['Nama Nomenklatur', 'Golongan', 'Jml Klasifikasi', 'Kualifikasi'];
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
      const values = [r.name, r.grade, String(r.jumlah_klasifikasi), r.qualification?.substring(0, 60) || '-'];
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
  } catch (err) { next(err); }
};



// ────────────────────────────────────────────────────────────────────
// POST /nomenklatur/import - Import dari CSV
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

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/export/json/preview  — Preview JSON
// ────────────────────────────────────────────────────────────────────
const previewJson = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const where = search ? 'WHERE n.name LIKE ? OR n.grade LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(
      `SELECT n.id, n.name, n.qualification, n.duties, n.grade,
              COUNT(nc.id) AS jumlah_klasifikasi
       FROM nomenclatures n
       LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
       ${where}
       GROUP BY n.id ORDER BY n.name ASC`, params
    );

    const output = {
      exported_at: new Date().toISOString(),
      total: rows.length,
      data: rows
    };

    const jsonString = JSON.stringify(output, null, 2);
    const downloadUrl = `/nomenklatur/export/json?search=${encodeURIComponent(search)}`;

    res.locals.layout = 'layouts/preview';
    res.render('nomenklatur/preview-json', {
      title: 'Preview JSON — Nomenklatur Jabatan',
      jsonString,
      total: rows.length,
      downloadUrl
    });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/export/json - Export daftar ke JSON
// ────────────────────────────────────────────────────────────────────
const exportJson = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT n.id, n.name, n.qualification, n.duties, n.grade,
             COUNT(nc.id) AS jumlah_klasifikasi
      FROM nomenclatures n
      LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
      GROUP BY n.id ORDER BY n.name ASC
    `);

    const output = {
      exported_at: new Date().toISOString(),
      total: rows.length,
      data: rows
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-nomenklatur.json"');
    res.send(JSON.stringify(output, null, 2));
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /nomenklatur/api       - Public API: daftar nomenklatur (JSON)
// GET /nomenklatur/api/:id   - Public API: detail nomenklatur + klasifikasi
// ────────────────────────────────────────────────────────────────────
const apiIndex = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const where = search ? 'WHERE n.name LIKE ? OR n.grade LIKE ?' : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(
      `SELECT n.id, n.name, n.qualification, n.duties, n.grade,
              COUNT(nc.id) AS jumlah_klasifikasi
       FROM nomenclatures n
       LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
       ${where}
       GROUP BY n.id ORDER BY n.name ASC`,
      params
    );
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) { next(err); }
};

const apiShow = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[nom]] = await db.query('SELECT * FROM nomenclatures WHERE id = ?', [id]);
    if (!nom) return res.status(404).json({ success: false, message: 'Nomenklatur tidak ditemukan' });

    const [klasifikasi] = await db.query(
      'SELECT id, name, description FROM nomenclature_classifications WHERE nomenclature_id = ? ORDER BY name ASC', [id]
    );
    res.json({ success: true, data: { ...nom, klasifikasi } });
  } catch (err) { next(err); }
};

module.exports = {
  index, show, create, store, edit, update, destroy,
  storeKlasifikasi, updateKlasifikasi, destroyKlasifikasi,
  exportPdf, previewPdf, exportJson, previewJson, importCsv, upload,
  apiIndex, apiShow
};