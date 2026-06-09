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
    const where = search ? `WHERE ci.name LIKE ? OR tc.name LIKE ? OR tc.code LIKE ?` : '';
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

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sbm-perjadin.pdf"');
    doc.pipe(res);

    const W = doc.page.width, H = doc.page.height;
    const ML = 45, MR = 45;
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoPath = path.join(__dirname, '../public/assets/images/logo-fti.png');
    const C_DARK = '#1f2937', C_GRAY = '#6b7280', C_LINE = '#e5e7eb', C_STRIPE = '#f9fafb', C_HEAD = '#374151';
    const formatRp = (n) => new Intl.NumberFormat('id-ID').format(n);

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
      doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('DATA SBM PERJALANAN DINAS', 0, KOP_H + 10, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7.5).font('Helvetica').text('Fakultas Teknologi Informasi, Universitas Andalas', 0, KOP_H + 25, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text(`Dicetak: ${tanggal}`, 0, 22, { width: W - MR, align: 'right' })
         .text(`Total Data: ${rows.length} data`, 0, 33, { width: W - MR, align: 'right' });
      return KOP_H + 36;
    };

    const colWidths = [160, 180, 70, 180, 110];
    const headers = ['Kota Tujuan', 'Komponen Biaya', 'Kode', 'Peruntukan', 'Tarif (Rp)'];
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
      const values = [r.kota, r.komponen, r.kode, r.peruntukan, formatRp(r.amount)];
      let cx = ML;
      values.forEach((v, i) => {
        const align = i === 4 ? 'right' : 'left';
        doc.fillColor(C_DARK).fontSize(7.5).font('Helvetica').text(String(v), cx + 5, y + 5, { width: colWidths[i] - 10, align });
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

// GET /sbm/export/json
const exportJson = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT tcs.id, ci.name AS kota, tc.name AS komponen, tc.code AS kode_komponen,
              sp.name AS jabatan, eg.name AS golongan, tcs.amount
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       ORDER BY ci.name ASC, tc.name ASC`
    );

    const output = {
      exported_at: new Date().toISOString(),
      total: rows.length,
      data: rows
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-sbm.json"');
    res.send(JSON.stringify(output, null, 2));
  } catch (err) { next(err); }
};

module.exports = {
  index, create, store, show, edit, update, destroy,
  exportPdf, exportJson, importCsv, upload
};