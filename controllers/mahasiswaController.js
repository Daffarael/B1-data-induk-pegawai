const db = require('../lib/db');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { parse } = require('csv-parse');
const path = require('path');
const fs = require('fs');

// ─── Multer config (upload ke memori) ───
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Hanya file CSV yang diizinkan'));
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 } // maks 2MB
});

// Helper: Mapping angka
const genderMap = { 1: 'Laki-laki', 2: 'Perempuan' };
const religionMap = { 1: 'Islam', 2: 'Kristen', 3: 'Katolik', 4: 'Hindu', 5: 'Buddha', 6: 'Konghucu' };
const statusMap = { 1: 'Aktif', 2: 'Cuti', 3: 'Lulus', 4: 'Keluar', 5: 'Drop Out' };

const buildListQuery = (search, statusFilter) => {
  let where = [];
  let params = [];

  if (search) {
    where.push('(s.name LIKE ? OR s.regno LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (statusFilter && Object.keys(statusMap).includes(statusFilter)) {
    where.push('s.status = ?');
    params.push(statusFilter);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  return { whereClause, params };
};

// GET /mahasiswa
const index = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { whereClause, params } = buildListQuery(search, statusFilter);

    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM students s ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Global Stats Query
    const [statRows] = await db.query(
      `SELECT status, COUNT(*) as count FROM students s ${whereClause} GROUP BY status`,
      params
    );
    let totalAktif = 0;
    let totalCuti = 0;
    let totalLulus = 0;
    statRows.forEach(row => {
      if (row.status === 1) totalAktif = row.count;
      if (row.status === 2) totalCuti = row.count;
      if (row.status === 3) totalLulus = row.count;
    });

    const [mahasiswa] = await db.query(
      `SELECT s.id, s.regno, s.name, s.gender, s.status, s.year,
              ou.name AS department_name
       FROM students s
       LEFT JOIN organization_units ou ON s.department_id = ou.id
       ${whereClause}
       ORDER BY s.regno ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Map properties
    mahasiswa.forEach(m => {
      m.gender_text = genderMap[m.gender] || '-';
      m.status_text = statusMap[m.status] || '-';
    });

    res.render('mahasiswa/index', {
      title: 'Data Mahasiswa',
      mahasiswa,
      search,
      statusFilter,
      currentPage: page,
      totalPages,
      total,
      totalAktif,
      totalCuti,
      totalLulus,
      statusMap
    });
  } catch (err) {
    next(err);
  }
};

// GET /mahasiswa/:id
const show = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT s.*, 
              ou.name AS department_name,
              e.name AS advisor_name
       FROM students s
       LEFT JOIN organization_units ou ON s.department_id = ou.id
       LEFT JOIN employees e ON s.advisor_id = e.id
       WHERE s.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }

    const mahasiswa = rows[0];
    mahasiswa.gender_text = genderMap[mahasiswa.gender] || '-';
    mahasiswa.religion_text = religionMap[mahasiswa.religion] || '-';
    mahasiswa.status_text = statusMap[mahasiswa.status] || '-';

    res.render('mahasiswa/show', {
      title: `Detail — ${mahasiswa.name}`,
      mahasiswa
    });
  } catch (err) {
    next(err);
  }
};

// GET /mahasiswa/create
const create = async (req, res, next) => {
  try {
    const [units] = await db.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
    const [advisors] = await db.query(
      `SELECT e.id, e.name, e.employee_number 
       FROM employees e 
       INNER JOIN lecturers l ON e.id = l.id 
       ORDER BY e.name ASC`
    );

    res.render('mahasiswa/create', {
      title: 'Tambah Mahasiswa',
      units,
      advisors,
      statusMap,
      old: {},
      errors: []
    });
  } catch (err) {
    next(err);
  }
};

// POST /mahasiswa
const store = async (req, res, next) => {
  const {
    regno, name, birth_place, birth_date, gender, religion,
    email, campus_email, phone_no, 
    home_address, home_town, home_province, home_postalcode,
    current_address, current_town, current_province, current_postalcode,
    department_id, year, status, advisor_id, citizenship
  } = req.body;

  const errors = [];
  if (!regno?.trim()) errors.push('NIM wajib diisi');
  if (!name?.trim()) errors.push('Nama wajib diisi');
  if (!birth_date) errors.push('Tanggal lahir wajib diisi');
  if (!gender) errors.push('Jenis kelamin wajib dipilih');
  if (!department_id) errors.push('Program Studi/Departemen wajib dipilih');
  if (!year) errors.push('Tahun angkatan wajib diisi');
  if (!status) errors.push('Status mahasiswa wajib dipilih');

  if (errors.length > 0) {
    const [units] = await db.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
    const [advisors] = await db.query("SELECT e.id, e.name FROM employees e INNER JOIN lecturers l ON e.id = l.id ORDER BY e.name ASC");
    return res.status(422).render('mahasiswa/create', {
      title: 'Tambah Mahasiswa',
      units, advisors, statusMap, errors, old: req.body
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id FROM students WHERE regno = ?', [regno.trim()]);
    if (existing.length > 0) {
      await conn.rollback();
      const [units] = await conn.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
      const [advisors] = await db.query("SELECT e.id, e.name FROM employees e INNER JOIN lecturers l ON e.id = l.id ORDER BY e.name ASC");
      return res.status(422).render('mahasiswa/create', {
        title: 'Tambah Mahasiswa',
        units, advisors, statusMap,
        errors: ['NIM sudah terdaftar'],
        old: req.body
      });
    }

    // Auto Increment Manual
    const [maxResult] = await conn.query('SELECT MAX(id) as maxId FROM students');
    const newId = (maxResult[0].maxId || 0) + 1;

    await conn.query(
      `INSERT INTO students
         (id, regno, name, birth_place, birth_date, gender, religion,
          email, campus_email, phone_no, 
          home_address, home_town, home_province, home_postalcode,
          current_address, current_town, current_province, current_postalcode,
          department_id, year, status, advisor_id, citizenship, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        newId, regno.trim(), name.trim(), birth_place?.trim() || null, birth_date, 
        gender || null, religion || null, email?.trim() || null, campus_email?.trim() || null, 
        phone_no?.trim() || null, home_address?.trim() || null, home_town?.trim() || null, 
        home_province?.trim() || null, home_postalcode?.trim() || null, current_address?.trim() || null, 
        current_town?.trim() || null, current_province?.trim() || null, current_postalcode?.trim() || null,
        department_id || null, year || null, status || null, advisor_id || null, citizenship?.trim() || null
      ]
    );

    await conn.commit();
    req.flash('success', `Data mahasiswa "${name}" berhasil ditambahkan`);
    res.redirect('/mahasiswa');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// GET /mahasiswa/:id/edit
const edit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT * FROM students WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }

    const [units] = await db.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
    const [advisors] = await db.query("SELECT e.id, e.name FROM employees e INNER JOIN lecturers l ON e.id = l.id ORDER BY e.name ASC");

    // Format birth_date to YYYY-MM-DD for input type date
    const mahasiswa = rows[0];
    if (mahasiswa.birth_date) {
      mahasiswa.birth_date = new Date(mahasiswa.birth_date).toISOString().split('T')[0];
    }

    res.render('mahasiswa/edit', {
      title: `Edit — ${mahasiswa.name}`,
      mahasiswa,
      units,
      advisors,
      statusMap,
      errors: []
    });
  } catch (err) {
    next(err);
  }
};

// PUT /mahasiswa/:id
const update = async (req, res, next) => {
  const { id } = req.params;
  const {
    regno, name, birth_place, birth_date, gender, religion,
    email, campus_email, phone_no, 
    home_address, home_town, home_province, home_postalcode,
    current_address, current_town, current_province, current_postalcode,
    department_id, year, status, advisor_id, citizenship
  } = req.body;

  const errors = [];
  if (!regno?.trim()) errors.push('NIM wajib diisi');
  if (!name?.trim()) errors.push('Nama wajib diisi');
  if (!department_id) errors.push('Program Studi/Departemen wajib dipilih');
  if (!year) errors.push('Tahun angkatan wajib diisi');
  if (!status) errors.push('Status mahasiswa wajib dipilih');

  if (errors.length > 0) {
    const [units] = await db.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
    const [advisors] = await db.query("SELECT e.id, e.name FROM employees e INNER JOIN lecturers l ON e.id = l.id ORDER BY e.name ASC");
    const mahasiswa = { id, ...req.body };
      return res.status(422).render('mahasiswa/edit', {
        title: 'Edit Mahasiswa',
        mahasiswa, units, advisors, statusMap, errors
      });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query('SELECT id FROM students WHERE regno = ? AND id != ?', [regno.trim(), id]);
    if (existing.length > 0) {
      await conn.rollback();
      const [units] = await conn.query("SELECT id, name FROM organization_units WHERE type='department' ORDER BY name ASC");
      const [advisors] = await db.query("SELECT e.id, e.name FROM employees e INNER JOIN lecturers l ON e.id = l.id ORDER BY e.name ASC");
        return res.status(422).render('mahasiswa/edit', {
          title: 'Edit Mahasiswa',
          mahasiswa: { id, ...req.body }, units, advisors, statusMap,
          errors: ['NIM sudah digunakan mahasiswa lain']
        });
    }

    await conn.query(
      `UPDATE students SET
         regno = ?, name = ?, birth_place = ?, birth_date = ?, gender = ?, religion = ?,
         email = ?, campus_email = ?, phone_no = ?, 
         home_address = ?, home_town = ?, home_province = ?, home_postalcode = ?,
         current_address = ?, current_town = ?, current_province = ?, current_postalcode = ?,
         department_id = ?, year = ?, status = ?, advisor_id = ?, citizenship = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        regno.trim(), name.trim(), birth_place?.trim() || null, birth_date || null, 
        gender || null, religion || null, email?.trim() || null, campus_email?.trim() || null, 
        phone_no?.trim() || null, home_address?.trim() || null, home_town?.trim() || null, 
        home_province?.trim() || null, home_postalcode?.trim() || null, current_address?.trim() || null, 
        current_town?.trim() || null, current_province?.trim() || null, current_postalcode?.trim() || null,
        department_id || null, year || null, status || null, advisor_id || null, citizenship?.trim() || null, id
      ]
    );

    await conn.commit();
    req.flash('success', `Data mahasiswa "${name}" berhasil diperbarui`);
    res.redirect('/mahasiswa/' + id);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// DELETE /mahasiswa/:id
const destroy = async (req, res, next) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT name FROM students WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }
    await db.query('DELETE FROM students WHERE id = ?', [id]);
    req.flash('success', `Data mahasiswa "${rows[0].name}" berhasil dihapus`);
    res.redirect('/mahasiswa');
  } catch (err) {
    next(err);
  }
};

// GET /mahasiswa/export/pdf
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const { whereClause, params } = buildListQuery(search, statusFilter);

    const [mahasiswa] = await db.query(
      `SELECT s.regno, s.name, s.gender, s.year, s.status,
              ou.name AS department_name
       FROM students s
       LEFT JOIN organization_units ou ON s.department_id = ou.id
       ${whereClause}
       ORDER BY s.regno ASC`,
      params
    );

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="data-mahasiswa.pdf"');
    doc.pipe(res);

    const W = doc.page.width, H = doc.page.height;
    const ML = 45, MR = 45;
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoPath = path.join(__dirname, '../public/assets/images/logo-fti.png');
    const C_DARK = '#1f2937', C_GRAY = '#6b7280', C_LINE = '#e5e7eb', C_STRIPE = '#f9fafb', C_HEAD = '#374151';

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
      doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold').text('DAFTAR DATA MAHASISWA', 0, KOP_H + 10, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7.5).font('Helvetica').text('Fakultas Teknologi Informasi, Universitas Andalas', 0, KOP_H + 25, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text(`Dicetak: ${tanggal}`, 0, 22, { width: W - MR, align: 'right' })
         .text(`Total Data: ${mahasiswa.length} mahasiswa`, 0, 33, { width: W - MR, align: 'right' });
      return KOP_H + 36;
    };

    const colWidths = [130, 200, 60, 70, 190, 100];
    const headers = ['NIM', 'Nama Lengkap', 'L/P', 'Angkatan', 'Program Studi', 'Status'];
    const totalTableW = colWidths.reduce((a, b) => a + b, 0);
    const ROW_H = 18, HEAD_H = 20, pageBottom = H - 36;

    const drawTableHeader = (y) => {
      doc.rect(ML, y, totalTableW, HEAD_H).fill(C_HEAD);
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
      let cx = ML;
      headers.forEach((h, i) => { doc.text(h, cx + 5, y + 6, { width: colWidths[i] - 8 }); cx += colWidths[i]; });
      return y + HEAD_H;
    };

    const drawRow = (m, idx, y) => {
      if (idx % 2 !== 0) doc.rect(ML, y, totalTableW, ROW_H).fill(C_STRIPE);
      doc.moveTo(ML, y + ROW_H).lineTo(ML + totalTableW, y + ROW_H).strokeColor(C_LINE).lineWidth(0.3).stroke();
      const values = [m.regno, m.name, genderMap[m.gender] || '-', m.year || '-', m.department_name || '-', statusMap[m.status] || '-'];
      let cx = ML;
      values.forEach((v, i) => {
        if (i === 5) doc.fillColor(v === 'Aktif' ? '#15803d' : '#9ca3af').font('Helvetica-Bold');
        else doc.fillColor(C_DARK).font('Helvetica');
        doc.fontSize(7.5).text(String(v), cx + 5, y + 5, { width: colWidths[i] - 8 });
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

    mahasiswa.forEach((m, idx) => {
      if (rowY + ROW_H > pageBottom) {
        drawTableBorder(tableTopY, rowY); drawColLines(tableTopY, rowY); drawFooter(pageNum++);
        doc.addPage(); startY = drawPageHeader(); tableTopY = startY; rowY = drawTableHeader(startY);
      }
      drawRow(m, idx, rowY); rowY += ROW_H;
    });

    drawTableBorder(tableTopY, rowY); drawColLines(tableTopY, rowY); drawFooter(pageNum);
    doc.end();
  } catch (err) {
    next(err);
  }
};


// POST /mahasiswa/import
const importCsv = async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'File CSV wajib dipilih');
    return res.redirect('/mahasiswa');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const conn = await db.getConnection();

  try {
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (records.length === 0) {
      req.flash('error', 'File CSV kosong');
      return res.redirect('/mahasiswa');
    }

    await conn.beginTransaction();
    let imported = 0;
    let skipped = 0;

    const [maxResult] = await conn.query('SELECT MAX(id) as maxId FROM students');
    let currentMaxId = maxResult[0].maxId || 0;

    for (const row of records) {
      const [existing] = await conn.query('SELECT id FROM students WHERE regno = ?', [row.regno]);
      if (existing.length > 0) { skipped++; continue; }

      currentMaxId++;
      await conn.query(
        `INSERT INTO students
           (id, regno, name, gender, year, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [currentMaxId, row.regno, row.name, row.gender || null, row.year || null, row.status || null]
      );
      imported++;
    }

    await conn.commit();
    req.flash('success', `Import selesai: ${imported} data berhasil diimport, ${skipped} dilewati (NIM sudah ada)`);
    res.redirect('/mahasiswa');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// GET /mahasiswa/export/json
const exportJson = async (req, res, next) => {
  try {
    const [mahasiswa] = await db.query(
      `SELECT s.*, ou.name AS department_name, e.name AS advisor_name
       FROM students s
       LEFT JOIN organization_units ou ON s.department_id = ou.id
       LEFT JOIN employees e ON s.advisor_id = e.id
       ORDER BY s.regno ASC`
    );

    const output = {
      exported_at: new Date().toISOString(),
      total: mahasiswa.length,
      data: mahasiswa
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-mahasiswa.json"');
    res.send(JSON.stringify(output, null, 2));
  } catch (err) { next(err); }
};

module.exports = {
  index, show, create, store, edit, update, destroy, exportPdf, exportJson, importCsv, upload
}