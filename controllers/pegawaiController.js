const db = require('../lib/db');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const { parse } = require('csv-parse');
const path = require('path');
const fs = require('fs');

// ─── Multer config (upload ke memori saja, tidak simpan ke disk) ───
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

// ─── Query helper: ambil daftar pegawai (JOIN employees + lecturers) ───
const buildListQuery = (search, statusFilter) => {
  let where = [];
  let params = [];

  if (search) {
    where.push('(e.name LIKE ? OR e.employee_number LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (statusFilter && ['active', 'inactive'].includes(statusFilter)) {
    where.push('e.status = ?');
    params.push(statusFilter);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  return { whereClause, params };
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai — Daftar pegawai + search + pagination
// ────────────────────────────────────────────────────────────────────
const index = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const { whereClause, params } = buildListQuery(search, statusFilter);

    // Query total data (untuk pagination)
    const [countResult] = await db.query(
      `SELECT COUNT(*) as total
       FROM employees e
       LEFT JOIN lecturers l ON e.id = l.id
       ${whereClause}`,
      params
    );
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Query data pegawai
    const [pegawai] = await db.query(
      `SELECT
         e.id, e.employee_number, e.name, e.gender, e.phone_number,
         e.hire_date, e.status,
         ou.name AS unit_name,
         es.name AS employment_status_name,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.academic_rank, l.functional_position, l.expertise
       FROM employees e
       LEFT JOIN organization_units ou ON e.organization_unit_id = ou.id
       LEFT JOIN employment_statuses es ON e.employment_status_id = es.id
       LEFT JOIN lecturers l ON e.id = l.id
       ${whereClause}
       ORDER BY e.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.render('pegawai/index', {
      title: 'Data Pegawai & Dosen',
      pegawai,
      search,
      statusFilter,
      currentPage: page,
      totalPages,
      total
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai/:id — Detail satu pegawai
// ────────────────────────────────────────────────────────────────────
const show = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT
         e.*,
         ou.name AS unit_name,
         es.name AS employment_status_name,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.academic_rank, l.functional_position, l.expertise
       FROM employees e
       LEFT JOIN organization_units ou ON e.organization_unit_id = ou.id
       LEFT JOIN employment_statuses es ON e.employment_status_id = es.id
       LEFT JOIN lecturers l ON e.id = l.id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }

    res.render('pegawai/show', {
      title: `Detail — ${rows[0].name}`,
      pegawai: rows[0]
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai/create — Form tambah pegawai
// ────────────────────────────────────────────────────────────────────
const create = async (req, res, next) => {
  try {
    const [units] = await db.query('SELECT id, name FROM organization_units ORDER BY name ASC');
    const [statuses] = await db.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');

    res.render('pegawai/create', {
      title: 'Tambah Pegawai/Dosen',
      units,
      statuses,
      old: {},
      errors: []
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// POST /pegawai — Simpan data pegawai baru
// ────────────────────────────────────────────────────────────────────
const store = async (req, res, next) => {
  const {
    employee_number, national_id_number, tax_id_number,
    name, birth_place, birth_date, gender, religion, marital_status,
    address, phone_number, organization_unit_id, hire_date,
    employment_status_id, status, employee_type,
    academic_rank, functional_position, expertise
  } = req.body;

  // ── Validasi server-side ──
  const errors = [];
  if (!employee_number?.trim()) errors.push('Nomor Pegawai (NIP) wajib diisi');
  if (!name?.trim()) errors.push('Nama wajib diisi');
  if (!birth_place?.trim()) errors.push('Tempat lahir wajib diisi');
  if (!birth_date) errors.push('Tanggal lahir wajib diisi');
  if (!gender) errors.push('Jenis kelamin wajib dipilih');
  if (!marital_status) errors.push('Status pernikahan wajib dipilih');
  if (!address?.trim()) errors.push('Alamat wajib diisi');
  if (!organization_unit_id) errors.push('Unit organisasi wajib dipilih');
  if (!hire_date) errors.push('Tanggal masuk wajib diisi');
  if (!employment_status_id) errors.push('Status kepegawaian wajib dipilih');
  if (!status) errors.push('Status aktif wajib dipilih');
  if (employee_type === 'Dosen' && !academic_rank?.trim()) errors.push('Pangkat akademik wajib diisi untuk Dosen');

  if (errors.length > 0) {
    const [units] = await db.query('SELECT id, name FROM organization_units ORDER BY name ASC');
    const [statuses] = await db.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');
    return res.status(422).render('pegawai/create', {
      title: 'Tambah Pegawai/Dosen',
      units, statuses, errors, old: req.body
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Cek duplikat NIP
    const [existing] = await conn.query(
      'SELECT id FROM employees WHERE employee_number = ?',
      [employee_number.trim()]
    );
    if (existing.length > 0) {
      await conn.rollback();
      const [units] = await conn.query('SELECT id, name FROM organization_units ORDER BY name ASC');
      const [statuses] = await conn.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');
      return res.status(422).render('pegawai/create', {
        title: 'Tambah Pegawai/Dosen',
        units, statuses,
        errors: ['Nomor Pegawai (NIP) sudah terdaftar'],
        old: req.body
      });
    }

    // Insert ke tabel employees
    const [result] = await conn.query(
      `INSERT INTO employees
         (employee_number, national_id_number, tax_id_number, name,
          birth_place, birth_date, gender, religion, marital_status,
          address, phone_number, organization_unit_id, hire_date,
          employment_status_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        employee_number.trim(),
        national_id_number?.trim() || null,
        tax_id_number?.trim() || null,
        name.trim(), birth_place.trim(), birth_date,
        gender, religion?.trim() || null, marital_status,
        address.trim(), phone_number?.trim() || null,
        organization_unit_id, hire_date,
        employment_status_id, status
      ]
    );

    const newId = result.insertId;

    // Jika tipe Dosen, insert ke tabel lecturers juga
    if (employee_type === 'Dosen') {
      await conn.query(
        `INSERT INTO lecturers
           (id, academic_rank, functional_position, expertise, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [
          newId,
          academic_rank?.trim() || null,
          functional_position?.trim() || null,
          expertise?.trim() || null
        ]
      );
    }

    await conn.commit();
    req.flash('success', `Data pegawai "${name}" berhasil ditambahkan`);
    res.redirect('/pegawai');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai/:id/edit — Form edit pegawai
// ────────────────────────────────────────────────────────────────────
const edit = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT e.*,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.academic_rank, l.functional_position, l.expertise
       FROM employees e
       LEFT JOIN lecturers l ON e.id = l.id
       WHERE e.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }

    const [units] = await db.query('SELECT id, name FROM organization_units ORDER BY name ASC');
    const [statuses] = await db.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');

    res.render('pegawai/edit', {
      title: `Edit — ${rows[0].name}`,
      pegawai: rows[0],
      units,
      statuses,
      errors: []
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// PUT /pegawai/:id — Update data pegawai
// ────────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  const { id } = req.params;
  const {
    employee_number, national_id_number, tax_id_number,
    name, birth_place, birth_date, gender, religion, marital_status,
    address, phone_number, organization_unit_id, hire_date,
    employment_status_id, status, employee_type,
    academic_rank, functional_position, expertise
  } = req.body;

  // ── Validasi server-side ──
  const errors = [];
  if (!employee_number?.trim()) errors.push('Nomor Pegawai (NIP) wajib diisi');
  if (!name?.trim()) errors.push('Nama wajib diisi');
  if (!birth_place?.trim()) errors.push('Tempat lahir wajib diisi');
  if (!birth_date) errors.push('Tanggal lahir wajib diisi');
  if (!gender) errors.push('Jenis kelamin wajib dipilih');
  if (!marital_status) errors.push('Status pernikahan wajib dipilih');
  if (!address?.trim()) errors.push('Alamat wajib diisi');
  if (!organization_unit_id) errors.push('Unit organisasi wajib dipilih');
  if (!hire_date) errors.push('Tanggal masuk wajib diisi');
  if (!employment_status_id) errors.push('Status kepegawaian wajib dipilih');
  if (!status) errors.push('Status aktif wajib dipilih');
  if (employee_type === 'Dosen' && !academic_rank?.trim()) errors.push('Pangkat akademik wajib diisi untuk Dosen');

  if (errors.length > 0) {
    const [units] = await db.query('SELECT id, name FROM organization_units ORDER BY name ASC');
    const [statuses] = await db.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');
    const pegawai = { id, ...req.body };
    return res.status(422).render('pegawai/edit', {
      title: 'Edit Pegawai/Dosen',
      pegawai, units, statuses, errors
    });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Cek duplikat NIP (kecuali milik sendiri)
    const [existing] = await conn.query(
      'SELECT id FROM employees WHERE employee_number = ? AND id != ?',
      [employee_number.trim(), id]
    );
    if (existing.length > 0) {
      await conn.rollback();
      const [units] = await conn.query('SELECT id, name FROM organization_units ORDER BY name ASC');
      const [statuses] = await conn.query('SELECT id, name FROM employment_statuses ORDER BY name ASC');
      return res.status(422).render('pegawai/edit', {
        title: 'Edit Pegawai/Dosen',
        pegawai: { id, ...req.body }, units, statuses,
        errors: ['Nomor Pegawai (NIP) sudah digunakan pegawai lain']
      });
    }

    // Update tabel employees
    await conn.query(
      `UPDATE employees SET
         employee_number = ?, national_id_number = ?, tax_id_number = ?,
         name = ?, birth_place = ?, birth_date = ?, gender = ?,
         religion = ?, marital_status = ?, address = ?, phone_number = ?,
         organization_unit_id = ?, hire_date = ?,
         employment_status_id = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        employee_number.trim(),
        national_id_number?.trim() || null,
        tax_id_number?.trim() || null,
        name.trim(), birth_place.trim(), birth_date,
        gender, religion?.trim() || null, marital_status,
        address.trim(), phone_number?.trim() || null,
        organization_unit_id, hire_date,
        employment_status_id, status, id
      ]
    );

    // Cek apakah sudah ada di lecturers
    const [existingLecturer] = await conn.query(
      'SELECT id FROM lecturers WHERE id = ?', [id]
    );

    if (employee_type === 'Dosen') {
      if (existingLecturer.length > 0) {
        // Update lecturers
        await conn.query(
          `UPDATE lecturers SET
             academic_rank = ?, functional_position = ?, expertise = ?, updated_at = NOW()
           WHERE id = ?`,
          [academic_rank?.trim() || null, functional_position?.trim() || null, expertise?.trim() || null, id]
        );
      } else {
        // Insert ke lecturers (baru dijadikan Dosen)
        await conn.query(
          `INSERT INTO lecturers (id, academic_rank, functional_position, expertise, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [id, academic_rank?.trim() || null, functional_position?.trim() || null, expertise?.trim() || null]
        );
      }
    } else {
      // Jika diubah dari Dosen → Staf, hapus dari lecturers
      if (existingLecturer.length > 0) {
        await conn.query('DELETE FROM lecturers WHERE id = ?', [id]);
      }
    }

    await conn.commit();
    req.flash('success', `Data pegawai "${name}" berhasil diperbarui`);
    res.redirect('/pegawai/' + id);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ────────────────────────────────────────────────────────────────────
// DELETE /pegawai/:id — Hapus pegawai
// ────────────────────────────────────────────────────────────────────
const destroy = async (req, res, next) => {
  const { id } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Cek pegawai ada
    const [rows] = await conn.query('SELECT name FROM employees WHERE id = ?', [id]);
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).render('errors/404', { title: 'Tidak Ditemukan' });
    }

    const namaP = rows[0].name;

    // Hapus dari lecturers dulu (jika ada) karena FK
    await conn.query('DELETE FROM lecturers WHERE id = ?', [id]);

    // Hapus dari employees
    await conn.query('DELETE FROM employees WHERE id = ?', [id]);

    await conn.commit();
    req.flash('success', `Data pegawai "${namaP}" berhasil dihapus`);
    res.redirect('/pegawai');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai/export/pdf — Export daftar ke PDF
// ────────────────────────────────────────────────────────────────────
const exportPdf = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const { whereClause, params } = buildListQuery(search, statusFilter);

    const [pegawai] = await db.query(
      `SELECT
         e.employee_number, e.name, e.gender, e.phone_number,
         e.hire_date, e.status,
         ou.name AS unit_name,
         es.name AS employment_status_name,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type
       FROM employees e
       LEFT JOIN organization_units ou ON e.organization_unit_id = ou.id
       LEFT JOIN employment_statuses es ON e.employment_status_id = es.id
       LEFT JOIN lecturers l ON e.id = l.id
       ${whereClause}
       ORDER BY e.name ASC`,
      params
    );

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="data-pegawai.pdf"');
    doc.pipe(res);

    // ── Header PDF ──
    doc.fontSize(16).font('Helvetica-Bold')
       .text('DAFTAR DATA PEGAWAI & DOSEN', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
       .text('FacultyWare — Fakultas Teknologi Informasi, Universitas Andalas', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, { align: 'right' });
    doc.moveDown();

    // ── Header tabel ──
    const colWidths = [100, 150, 60, 80, 110, 80, 80, 80];
    const headers = ['NIP', 'Nama', 'Tipe', 'Jenis Kelamin', 'Unit', 'Status Kepeg.', 'Tgl Masuk', 'Status'];
    let x = 40;
    const headerY = doc.y;

    doc.rect(40, headerY, colWidths.reduce((a, b) => a + b, 0), 18).fill('#2563eb');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => {
      doc.text(h, x + 3, headerY + 4, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });

    // ── Baris data ──
    doc.fillColor('black').font('Helvetica').fontSize(8);
    let rowY = headerY + 18;

    pegawai.forEach((p, idx) => {
      const rowH = 18;
      if (idx % 2 === 0) {
        doc.rect(40, rowY, colWidths.reduce((a, b) => a + b, 0), rowH).fill('#f1f5f9');
      }
      doc.fillColor('black');
      x = 40;
      const values = [
        p.employee_number,
        p.name,
        p.employee_type,
        p.gender === 'male' ? 'Laki-laki' : 'Perempuan',
        p.unit_name || '-',
        p.employment_status_name || '-',
        p.hire_date ? new Date(p.hire_date).toLocaleDateString('id-ID') : '-',
        p.status === 'active' ? 'Aktif' : 'Tidak Aktif'
      ];
      values.forEach((v, i) => {
        doc.text(String(v || '-'), x + 3, rowY + 4, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });
      rowY += rowH;

      // Tambah halaman baru jika hampir habis
      if (rowY > doc.page.height - 60) {
        doc.addPage();
        rowY = 40;
      }
    });

    doc.moveDown(2);
    doc.fontSize(8).text(`Total: ${pegawai.length} pegawai`, 40);

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// POST /pegawai/import — Import dari CSV
// ────────────────────────────────────────────────────────────────────
const importCsv = async (req, res, next) => {
  if (!req.file) {
    req.flash('error', 'File CSV wajib dipilih');
    return res.redirect('/pegawai');
  }

  const csvContent = req.file.buffer.toString('utf-8');
  const conn = await db.getConnection();

  try {
    // Parse CSV
    const records = await new Promise((resolve, reject) => {
      parse(csvContent, {
        columns: true,        // baris pertama sebagai header
        skip_empty_lines: true,
        trim: true
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (records.length === 0) {
      req.flash('error', 'File CSV kosong');
      return res.redirect('/pegawai');
    }

    // Validasi kolom wajib ada di CSV
    const requiredCols = ['employee_number', 'name', 'birth_place', 'birth_date',
                          'gender', 'marital_status', 'address',
                          'organization_unit_id', 'hire_date', 'employment_status_id', 'status'];
    const firstRow = records[0];
    const missingCols = requiredCols.filter(col => !(col in firstRow));
    if (missingCols.length > 0) {
      req.flash('error', `Kolom wajib tidak ditemukan di CSV: ${missingCols.join(', ')}`);
      return res.redirect('/pegawai');
    }

    await conn.beginTransaction();

    let imported = 0;
    let skipped = 0;

    for (const row of records) {
      // Skip jika NIP sudah ada
      const [existing] = await conn.query(
        'SELECT id FROM employees WHERE employee_number = ?',
        [row.employee_number]
      );
      if (existing.length > 0) { skipped++; continue; }

      const [result] = await conn.query(
        `INSERT INTO employees
           (employee_number, national_id_number, tax_id_number, name,
            birth_place, birth_date, gender, religion, marital_status,
            address, phone_number, organization_unit_id, hire_date,
            employment_status_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          row.employee_number, row.national_id_number || null, row.tax_id_number || null,
          row.name, row.birth_place, row.birth_date,
          row.gender, row.religion || null, row.marital_status,
          row.address, row.phone_number || null,
          row.organization_unit_id, row.hire_date,
          row.employment_status_id, row.status
        ]
      );

      // Jika ada kolom academic_rank → masukkan ke lecturers
      if (row.academic_rank) {
        await conn.query(
          `INSERT INTO lecturers (id, academic_rank, functional_position, expertise, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [result.insertId, row.academic_rank, row.functional_position || null, row.expertise || null]
        );
      }
      imported++;
    }

    await conn.commit();
    req.flash('success', `Import selesai: ${imported} data berhasil diimport, ${skipped} dilewati (NIP sudah ada)`);
    res.redirect('/pegawai');
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
};

module.exports = {
  index,
  show,
  create,
  store,
  edit,
  update,
  destroy,
  exportPdf,
  importCsv,
  upload  // expose multer middleware
};
