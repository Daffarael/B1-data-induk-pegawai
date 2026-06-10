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
      title: `Detail - ${mahasiswa.name}`,
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
      departments: units, statusMap,
      advisors,
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
      departments: units, statusMap, advisors, errors, old: req.body
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
        departments: units, statusMap, advisors,
        errors: ['NIM sudah terdaftar'],
        old: req.body
      });
    }

    // Auto Increment Manual
    const [maxResult] = await conn.query('SELECT MAX(id) as maxId FROM students');
    const newId = (maxResult[0].maxId || 0) + 1;

    // Generate campus email automatically (Format: NIM_NAMA DEPAN_@gmail.com)
    let generatedCampusEmail = null;
    if (regno && name) {
      const firstName = name.trim().split(' ')[0].toUpperCase();
      generatedCampusEmail = `${regno.trim()}_${firstName}_@gmail.com`;
    }

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
        gender || null, religion || null, email?.trim() || null, generatedCampusEmail, 
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
      title: `Edit - ${mahasiswa.name}`,
      m: mahasiswa,
      departments: units, statusMap,
      advisors,
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
      m: mahasiswa, departments: units, statusMap, advisors, errors
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
        m: { id, ...req.body }, departments: units, statusMap, advisors,
        errors: ['NIM sudah digunakan mahasiswa lain']
      });
    }

    // Auto-update campus email format in case NIM or name changed
    let generatedCampusEmail = null;
    if (regno && name) {
      const firstName = name.trim().split(' ')[0].toUpperCase();
      generatedCampusEmail = `${regno.trim()}_${firstName}_@gmail.com`;
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
        gender || null, religion || null, email?.trim() || null, generatedCampusEmail, 
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

// GET /mahasiswa/export/json
const exportJson = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const { whereClause, params } = buildListQuery(search, statusFilter);

    const [mahasiswa] = await db.query(
      `SELECT s.id, s.regno, s.name, s.gender, s.status, s.year,
              ou.name AS department_name
       FROM students s
       LEFT JOIN organization_units ou ON s.department_id = ou.id
       ${whereClause}
       ORDER BY s.name ASC`,
      params
    );

    const output = {
      exported_at: new Date().toISOString(),
      total: mahasiswa.length,
      data: mahasiswa
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-mahasiswa.json"');
    res.send(JSON.stringify(output, null, 2));
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

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="data-mahasiswa.pdf"');
    doc.pipe(res);

    doc.fontSize(16).font('Helvetica-Bold').text('DAFTAR DATA MAHASISWA', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('FacultyWare - Fakultas Teknologi Informasi, Universitas Andalas', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'right' });
    doc.moveDown();

    const colWidths = [120, 180, 80, 80, 150, 80];
    const headers = ['NIM', 'Nama Lengkap', 'L/P', 'Angkatan', 'Program Studi', 'Status'];
    let x = 40;
    const headerY = doc.y;

    doc.rect(40, headerY, colWidths.reduce((a, b) => a + b, 0), 18).fill('#2563eb');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x + 3, headerY + 4, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });

    doc.fillColor('black').font('Helvetica').fontSize(8);
    let rowY = headerY + 18;

    mahasiswa.forEach((m, idx) => {
      const rowH = 18;
      if (idx % 2 === 0) doc.rect(40, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#f1f5f9');
      doc.fillColor('black');
      x = 40;
      const values = [
        m.regno, m.name, genderMap[m.gender] || '-', m.year || '-', m.department_name || '-', statusMap[m.status] || '-'
      ];
      values.forEach((v, i) => {
        doc.text(String(v), x + 3, rowY + 4, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });
      rowY += rowH;
      if (rowY > doc.page.height - 60) { doc.addPage(); rowY = 40; }
    });

    doc.moveDown(2);
    doc.fontSize(8).text(`Total: ${mahasiswa.length} mahasiswa`, 40);
    doc.end();
  } catch (err) {
    next(err);
  }
};

// POST /mahasiswa/import
const importCsv = async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'File CSV wajib dipilih. Pastikan format file adalah .csv');
    return res.redirect('/mahasiswa');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const conn = await db.getConnection();

  try {
    let records;
    try {
      records = await new Promise((resolve, reject) => {
        parse(csvContent, { columns: true, skip_empty_lines: true, trim: true }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
    } catch (parseErr) {
      await conn.release();
      req.flash('error', `File CSV tidak valid atau rusak: ${parseErr.message}`);
      return res.redirect('/mahasiswa');
    }

    if (records.length === 0) {
      conn.release();
      req.flash('error', 'File CSV kosong, tidak ada data yang diimport');
      return res.redirect('/mahasiswa');
    }

    // Validasi kolom wajib
    const requiredCols = ['regno', 'name', 'gender', 'year', 'status'];
    const firstRow = records[0];
    const missingCols = requiredCols.filter(col => !(col in firstRow));
    if (missingCols.length > 0) {
      conn.release();
      req.flash('error', `Format CSV tidak valid. Kolom wajib tidak ditemukan: ${missingCols.join(', ')}. Kolom yang dibutuhkan: regno, name, gender, year, status`);
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
    req.flash('error', `Gagal import: ${err.message}`);
    res.redirect('/mahasiswa');
  } finally {
    conn.release();
  }
};

module.exports = {
  index, show, create, store, edit, update, destroy, exportPdf, exportJson, importCsv, upload
};