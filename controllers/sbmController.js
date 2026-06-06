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

// ─── Helper: ambil data dropdown ───
const getDropdownData = async () => {
  const [cities]     = await db.query('SELECT id, name FROM cities ORDER BY name ASC');
  const [components] = await db.query('SELECT id, name, code FROM travel_cost_components ORDER BY name ASC');
  const [positions]  = await db.query('SELECT id, name FROM structural_positions ORDER BY name ASC');
  const [grades]     = await db.query('SELECT id, name FROM employee_grades ORDER BY name ASC');
  return { cities, components, positions, grades };
};

// ────────────────────────────────────────────────────────────────────
// GET /sbm — Daftar SBM + search + pagination
// ────────────────────────────────────────────────────────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const page   = parseInt(req.query.page) || 1;
    const limit  = 10;
    const offset = (page - 1) * limit;

    const likeParam = `%${search}%`;
    const where = search
      ? `WHERE ci.name LIKE ? OR tc.name LIKE ? OR tc.code LIKE ? OR sp.name LIKE ? OR eg.name LIKE ?`
      : '';
    const params = search ? [likeParam, likeParam, likeParam, likeParam, likeParam] : [];

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       ${where}`, params
    );
    const totalPages = Math.ceil(total / limit);

    const [[stats]] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM travel_cost_standards) AS totalSbm,
        (SELECT COUNT(*) FROM travel_cost_components) AS totalKomponen,
        (SELECT COUNT(DISTINCT city_id) FROM travel_cost_standards) AS totalKota
    `);

    const [sbm] = await db.query(
      `SELECT tcs.id, ci.name AS kota, tc.name AS komponen, tc.code AS kode_komponen,
              sp.name AS jabatan, eg.name AS golongan, tcs.amount
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       ${where}
       ORDER BY ci.name ASC, tc.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('sbm/index', {
      title: 'Data SBM Perjadin',
      sbm, search,
      currentPage: page, totalPages, total,
      totalSbm: stats.totalSbm,
      totalKomponen: stats.totalKomponen,
      totalKota: stats.totalKota
    });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /sbm/create
// ────────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const dropdown = await getDropdownData();
    res.render('sbm/create', { title: 'Tambah SBM Perjadin', old: {}, errors: [], ...dropdown });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// POST /sbm — Simpan SBM baru
// ────────────────────────────────────────────────────────────────────
const store = async (req, res, next) => {
  const { city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount } = req.body;
  const errors = [];
  if (!city_id)                   errors.push('Kota tujuan wajib dipilih');
  if (!travel_cost_component_id)  errors.push('Komponen biaya wajib dipilih');
  if (!amount || isNaN(amount))   errors.push('Jumlah tarif wajib diisi dan harus berupa angka');

  if (errors.length > 0) {
    const dropdown = await getDropdownData();
    return res.status(422).render('sbm/create', {
      title: 'Tambah SBM Perjadin', errors, old: req.body, ...dropdown
    });
  }

  try {
    await db.query(
      `INSERT INTO travel_cost_standards
         (city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        city_id,
        travel_cost_component_id,
        structural_position_id || null,
        employee_grade_id || null,
        parseFloat(amount)
      ]
    );
    req.flash('success', 'Data SBM berhasil ditambahkan');
    res.redirect('/sbm');
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /sbm/:id — Detail SBM
// ────────────────────────────────────────────────────────────────────
const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[sbm]] = await db.query(
      `SELECT tcs.*, ci.name AS kota, tc.name AS komponen, tc.code AS kode_komponen,
              tc.description AS komponen_desc,
              sp.name AS jabatan, eg.name AS golongan
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       WHERE tcs.id = ?`, [id]
    );
    if (!sbm) return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });

    res.render('sbm/show', { title: `Detail SBM — ${sbm.kota}`, sbm });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /sbm/:id/edit
// ────────────────────────────────────────────────────────────────────
const edit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[sbm]] = await db.query('SELECT * FROM travel_cost_standards WHERE id = ?', [id]);
    if (!sbm) return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    const dropdown = await getDropdownData();
    res.render('sbm/edit', { title: 'Edit SBM Perjadin', sbm, errors: [], ...dropdown });
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// PUT /sbm/:id — Update SBM
// ────────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  const { id } = req.params;
  const { city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount } = req.body;
  const errors = [];
  if (!city_id)                   errors.push('Kota tujuan wajib dipilih');
  if (!travel_cost_component_id)  errors.push('Komponen biaya wajib dipilih');
  if (!amount || isNaN(amount))   errors.push('Jumlah tarif wajib diisi dan harus berupa angka');

  if (errors.length > 0) {
    const [[sbm]] = await db.query('SELECT * FROM travel_cost_standards WHERE id = ?', [id]);
    const dropdown = await getDropdownData();
    return res.status(422).render('sbm/edit', {
      title: 'Edit SBM Perjadin', sbm: { ...sbm, ...req.body, id }, errors, ...dropdown
    });
  }

  try {
    await db.query(
      `UPDATE travel_cost_standards
         SET city_id=?, travel_cost_component_id=?, structural_position_id=?, employee_grade_id=?, amount=?, updated_at=NOW()
       WHERE id=?`,
      [
        city_id,
        travel_cost_component_id,
        structural_position_id || null,
        employee_grade_id || null,
        parseFloat(amount),
        id
      ]
    );
    req.flash('success', 'Data SBM berhasil diperbarui');
    res.redirect('/sbm/' + id);
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// DELETE /sbm/:id — Hapus SBM
// ────────────────────────────────────────────────────────────────────
const destroy = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [[sbm]] = await db.query('SELECT id FROM travel_cost_standards WHERE id = ?', [id]);
    if (!sbm) { req.flash('error', 'Data tidak ditemukan'); return res.redirect('/sbm'); }
    await db.query('DELETE FROM travel_cost_standards WHERE id = ?', [id]);
    req.flash('success', 'Data SBM berhasil dihapus');
    res.redirect('/sbm');
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// GET /sbm/export/pdf
// ────────────────────────────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const where = search
      ? `WHERE ci.name LIKE ? OR tc.name LIKE ? OR tc.code LIKE ?`
      : '';
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(
      `SELECT ci.name AS kota, tc.name AS komponen, tc.code AS kode,
              COALESCE(sp.name, eg.name, '-') AS peruntukan,
              tcs.amount
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       ${where}
       ORDER BY ci.name ASC, tc.name ASC`, params
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sbm-perjadin.pdf"');
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('DATA SBM PERJALANAN DINAS', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('FacultyWare — Fakultas Teknologi Informasi', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'right' });
    doc.moveDown();

    const colWidths = [120, 130, 60, 130, 80];
    const headers = ['Kota Tujuan', 'Komponen Biaya', 'Kode', 'Peruntukan', 'Tarif (Rp)'];
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

    const formatRp = (n) => new Intl.NumberFormat('id-ID').format(n);

    rows.forEach((r, idx) => {
      const rowH = 18;
      if (idx % 2 === 0) doc.rect(40, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#f1f5f9');
      doc.fillColor('black');
      x = 40;
      const values = [r.kota, r.komponen, r.kode, r.peruntukan, formatRp(r.amount)];
      values.forEach((v, i) => { doc.text(String(v), x + 3, rowY + 4, { width: colWidths[i] - 6 }); x += colWidths[i]; });
      rowY += rowH;
      if (rowY > doc.page.height - 60) { doc.addPage(); rowY = 40; }
    });

    doc.moveDown(2).fontSize(8).text(`Total: ${rows.length} data SBM`, 40);
    doc.end();
  } catch (err) { next(err); }
};

// ────────────────────────────────────────────────────────────────────
// POST /sbm/import — Import dari CSV
// ────────────────────────────────────────────────────────────────────
const importCsv = async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'File CSV wajib dipilih');
    return res.redirect('/sbm');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const conn = await db.getConnection();
  try {
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, data) => {
        if (err) reject(err); else resolve(data);
      });
    });

    if (records.length === 0) { req.flash('error', 'File CSV kosong'); return res.redirect('/sbm'); }

    const requiredCols = ['city_id', 'travel_cost_component_id', 'amount'];
    const missing = requiredCols.filter(c => !(c in records[0]));
    if (missing.length > 0) {
      req.flash('error', `Kolom wajib tidak ditemukan: ${missing.join(', ')}`);
      return res.redirect('/sbm');
    }

    await conn.beginTransaction();
    let imported = 0, skipped = 0;
    for (const row of records) {
      if (!row.city_id || !row.travel_cost_component_id || !row.amount) { skipped++; continue; }
      await conn.query(
        `INSERT INTO travel_cost_standards
           (city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [row.city_id, row.travel_cost_component_id, row.structural_position_id || null, row.employee_grade_id || null, parseFloat(row.amount)]
      );
      imported++;
    }
    await conn.commit();
    req.flash('success', `Import selesai: ${imported} berhasil, ${skipped} dilewati`);
    res.redirect('/sbm');
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
};

module.exports = {
  index, create, store, show, edit, update, destroy,
  exportPdf, importCsv, upload
};