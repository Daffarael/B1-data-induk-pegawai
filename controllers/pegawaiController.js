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
// GET /pegawai - Daftar pegawai + search + pagination
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
         l.nidn, l.academic_rank, l.functional_position, l.expertise
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
// GET /pegawai/:id - Detail satu pegawai
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
         l.nidn, l.academic_rank, l.functional_position, l.expertise
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
      title: `Detail - ${rows[0].name}`,
      pegawai: rows[0]
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// GET /pegawai/create - Form tambah pegawai
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
// POST /pegawai - Simpan data pegawai baru
// ────────────────────────────────────────────────────────────────────
const store = async (req, res, next) => {
  const {
    employee_number, national_id_number, tax_id_number,
    name, birth_place, birth_date, gender, religion,
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
          birth_place, birth_date, gender, religion,
          address, phone_number, organization_unit_id, hire_date,
          employment_status_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        employee_number.trim(),
        national_id_number?.trim() || null,
        tax_id_number?.trim() || null,
        name.trim(), birth_place.trim(), birth_date,
        gender, religion?.trim() || null,
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
             (id, nidn, academic_rank, functional_position, expertise, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            newId,
            nidn?.trim() || null,
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
// GET /pegawai/:id/edit - Form edit pegawai
// ────────────────────────────────────────────────────────────────────
const edit = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `SELECT e.*,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.nidn, l.academic_rank, l.functional_position, l.expertise
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
      title: `Edit - ${rows[0].name}`,
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
// PUT /pegawai/:id - Update data pegawai
// ────────────────────────────────────────────────────────────────────
const update = async (req, res, next) => {
  const { id } = req.params;
  const {
    employee_number, national_id_number, tax_id_number,
    name, birth_place, birth_date, gender, religion,
    address, phone_number, organization_unit_id, hire_date,
    employment_status_id, status, employee_type,
    nidn, academic_rank, functional_position, expertise
  } = req.body;

  // ── Validasi server-side ──
  const errors = [];
  if (!employee_number?.trim()) errors.push('Nomor Pegawai (NIP) wajib diisi');
  if (!name?.trim()) errors.push('Nama wajib diisi');
  if (!birth_place?.trim()) errors.push('Tempat lahir wajib diisi');
  if (!birth_date) errors.push('Tanggal lahir wajib diisi');
  if (!gender) errors.push('Jenis kelamin wajib dipilih');
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
         religion = ?, address = ?, phone_number = ?,
         organization_unit_id = ?, hire_date = ?,
         employment_status_id = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        employee_number.trim(),
        national_id_number?.trim() || null,
        tax_id_number?.trim() || null,
        name.trim(), birth_place.trim(), birth_date,
        gender, religion?.trim() || null,
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
               nidn = ?, academic_rank = ?, functional_position = ?, expertise = ?, updated_at = NOW()
             WHERE id = ?`,
            [nidn?.trim() || null, academic_rank?.trim() || null, functional_position?.trim() || null, expertise?.trim() || null, id]
        );
      } else {
        // Insert ke lecturers (baru dijadikan Dosen)
        await conn.query(
          `INSERT INTO lecturers (id, nidn, academic_rank, functional_position, expertise, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
            [id, nidn?.trim() || null, academic_rank?.trim() || null, functional_position?.trim() || null, expertise?.trim() || null]
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
// DELETE /pegawai/:id - Hapus pegawai
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
// GET /pegawai/export/pdf - Export daftar ke PDF
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

    const doc = new PDFDocument({ margin: 0, size: 'A4', layout: 'landscape', autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="data-pegawai.pdf"');
    doc.pipe(res);

    const W   = doc.page.width;   // 841.89
    const H   = doc.page.height;  // 595.28
    const ML  = 45;
    const MR  = 45;
    const tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoPath = path.join(__dirname, '../public/assets/images/logo-fti.png');

    // ── Warna ──
    const C_DARK   = '#1f2937';   // teks gelap
    const C_GRAY   = '#6b7280';   // teks abu
    const C_LINE   = '#e5e7eb';   // garis tabel
    const C_STRIPE = '#f9fafb';   // stripe baris
    const C_HEAD   = '#374151';   // header tabel

    // ══════════════════════════════════════
    // Fungsi render satu halaman header
    // ══════════════════════════════════════
    const drawPageHeader = () => {
      const KOP_H = 90;

      // ── Logo FTI (kiri) ──
      try {
        doc.image(logoPath, ML, 14, { height: 58 });
      } catch (e) {
        // Fallback teks jika logo tidak ditemukan
        doc.rect(ML, 14, 58, 58).fill(C_HEAD);
        doc.fillColor('white').fontSize(11).font('Helvetica-Bold')
           .text('FTI', ML, 34, { width: 58, align: 'center' });
      }

      // ── Teks kop (tengah kanan logo) ──
      const textX = ML + 68;
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text('KEMENTERIAN PENDIDIKAN, KEBUDAYAAN, RISET, DAN TEKNOLOGI', textX, 15, { characterSpacing: 0.2 });
      doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold')
         .text('UNIVERSITAS ANDALAS', textX, 25);
      doc.fillColor(C_DARK).fontSize(9).font('Helvetica-Bold')
         .text('FAKULTAS TEKNOLOGI INFORMASI', textX, 37);
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text('Kampus Unand Limau Manis, Padang 25163, Telp. (0751) 72586', textX, 50);
      doc.fillColor(C_GRAY).fontSize(7)
         .text('Website: fti.unand.ac.id  |  Email: fti@unand.ac.id', textX, 60);

      // ── Garis kop (dobel) ──
      doc.moveTo(ML, KOP_H - 4).lineTo(W - MR, KOP_H - 4)
         .strokeColor(C_DARK).lineWidth(2).stroke();
      doc.moveTo(ML, KOP_H).lineTo(W - MR, KOP_H)
         .strokeColor(C_DARK).lineWidth(0.5).stroke();

      // ── Judul dokumen ──
      doc.fillColor(C_DARK).fontSize(11).font('Helvetica-Bold')
         .text('DAFTAR DATA PEGAWAI DAN DOSEN', 0, KOP_H + 10, { width: W, align: 'center' });
      doc.fillColor(C_GRAY).fontSize(7.5).font('Helvetica')
         .text(`Fakultas Teknologi Informasi, Universitas Andalas`, 0, KOP_H + 25, { width: W, align: 'center' });

      // ── Info tanggal & total (kanan) ──
      doc.fillColor(C_GRAY).fontSize(7).font('Helvetica')
         .text(`Dicetak: ${tanggal}`, 0, 22, { width: W - MR, align: 'right' })
         .text(`Total Data: ${pegawai.length} pegawai`, 0, 33, { width: W - MR, align: 'right' });

      return KOP_H + 36; // posisi Y setelah header
    };

    // ══════════════════════════════════════
    // Fungsi tabel
    // ══════════════════════════════════════
    const colWidths  = [110, 155, 55, 80, 130, 100, 75, 70];
    const headers    = ['NIP', 'Nama Lengkap', 'Tipe', 'Jenis Kelamin', 'Unit Organisasi', 'Status Kepeg.', 'Tgl Masuk', 'Status'];
    const totalTableW = colWidths.reduce((a, b) => a + b, 0);
    const ROW_H  = 18;
    const HEAD_H = 20;
    const pageBottom = H - 36;

    const drawTableHeader = (y) => {
      doc.rect(ML, y, totalTableW, HEAD_H).fill(C_HEAD);
      doc.fillColor('white').fontSize(7.5).font('Helvetica-Bold');
      let cx = ML;
      headers.forEach((h, i) => {
        doc.text(h, cx + 5, y + 6, { width: colWidths[i] - 8, align: 'left' });
        cx += colWidths[i];
      });
      return y + HEAD_H;
    };

    const drawRow = (p, idx, y) => {
      if (idx % 2 !== 0) {
        doc.rect(ML, y, totalTableW, ROW_H).fill(C_STRIPE);
      }
      doc.moveTo(ML, y + ROW_H).lineTo(ML + totalTableW, y + ROW_H)
         .strokeColor(C_LINE).lineWidth(0.3).stroke();

      const values = [
        p.employee_number || '-',
        p.name || '-',
        p.employee_type || '-',
        p.gender === 'male' ? 'Laki-laki' : 'Perempuan',
        p.unit_name || '-',
        p.employment_status_name || '-',
        p.hire_date ? new Date(p.hire_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
        p.status === 'active' ? 'Aktif' : 'Nonaktif'
      ];

      let cx = ML;
      values.forEach((v, i) => {
        if (i === 7)      doc.fillColor(v === 'Aktif' ? '#15803d' : '#9ca3af').font('Helvetica-Bold');
        else if (i === 2) doc.fillColor(C_HEAD).font('Helvetica');
        else              doc.fillColor(C_DARK).font('Helvetica');
        doc.fontSize(7.5).text(String(v), cx + 5, y + 5, { width: colWidths[i] - 8, align: 'left' });
        cx += colWidths[i];
      });
    };

    const drawTableBorder = (yTop, yBottom) => {
      doc.rect(ML, yTop, totalTableW, yBottom - yTop)
         .strokeColor('#d1d5db').lineWidth(0.5).stroke();
    };

    const drawColLines = (yTop, yBottom) => {
      let cx = ML;
      colWidths.forEach((w, i) => {
        cx += w;
        if (i < colWidths.length - 1) {
          doc.moveTo(cx, yTop).lineTo(cx, yBottom)
             .strokeColor(C_LINE).lineWidth(0.3).stroke();
        }
      });
    };

    const drawFooter = (pageNum) => {
      doc.moveTo(ML, H - 22).lineTo(W - MR, H - 22)
         .strokeColor('#d1d5db').lineWidth(0.4).stroke();
      doc.fillColor(C_GRAY).fontSize(6.5).font('Helvetica')
         .text('FacultyWare | Sistem Informasi Kepegawaian FTI Universitas Andalas', ML, H - 17)
         .text(`Halaman ${pageNum}  |  ${tanggal}`, 0, H - 17, { width: W - MR, align: 'right' });
    };

    // ══════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════
    let startY  = drawPageHeader();
    let tableTopY = startY;
    let rowY    = drawTableHeader(startY);
    let pageNum = 1;

    pegawai.forEach((p, idx) => {
      if (rowY + ROW_H > pageBottom) {
        drawTableBorder(tableTopY, rowY);
        drawColLines(tableTopY, rowY);
        drawFooter(pageNum++);
        doc.addPage();
        startY    = drawPageHeader();
        tableTopY = startY;
        rowY      = drawTableHeader(startY);
      }
      drawRow(p, idx, rowY);
      rowY += ROW_H;
    });

    drawTableBorder(tableTopY, rowY);
    drawColLines(tableTopY, rowY);
    drawFooter(pageNum);

    doc.end();
  } catch (err) {
    next(err);
  }
};


// ────────────────────────────────────────────────────────────────────
// GET /pegawai/export/json - Export daftar ke JSON
// ────────────────────────────────────────────────────────────────────
const exportJson = async (req, res, next) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const { whereClause, params } = buildListQuery(search, statusFilter);

    const [pegawai] = await db.query(
      `SELECT
         e.id, e.employee_number, e.national_id_number, e.tax_id_number,
         e.name, e.birth_place, e.birth_date, e.gender, e.religion,
         e.address, e.phone_number,
         e.hire_date, e.status,
         ou.name AS unit_name,
         es.name AS employment_status_name,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.nidn, l.academic_rank, l.functional_position, l.expertise
       FROM employees e
       LEFT JOIN organization_units ou ON e.organization_unit_id = ou.id
       LEFT JOIN employment_statuses es ON e.employment_status_id = es.id
       LEFT JOIN lecturers l ON e.id = l.id
       ${whereClause}
       ORDER BY e.name ASC`,
      params
    );

    const output = {
      exported_at: new Date().toISOString(),
      total: pegawai.length,
      data: pegawai
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="data-pegawai.json"');
    res.send(JSON.stringify(output, null, 2));
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────────────
// POST /pegawai/import - Import dari CSV

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
                          'gender', 'address',
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
            birth_place, birth_date, gender, religion,
            address, phone_number, organization_unit_id, hire_date,
            employment_status_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          row.employee_number, row.national_id_number || null, row.tax_id_number || null,
          row.name, row.birth_place, row.birth_date,
          row.gender, row.religion || null,
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
    if (conn) await conn.rollback();
    req.flash('error', `Gagal memproses file CSV: ${err.message}`);
    res.redirect('/pegawai');
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
  exportJson,
  importCsv,
  upload  // expose multer middleware
};
