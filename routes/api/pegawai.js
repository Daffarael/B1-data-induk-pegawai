const express = require('express');
const router = express.Router();
const db = require('../../lib/db');
const { isAuthenticated } = require('../../middlewares/auth');
const { hasRole } = require('../../middlewares/acl');

const guard = [isAuthenticated, hasRole(['Admin Kepegawaian', 'Admin Kemahasiswaan'])];

// ── Helper query ──────────────────────────────────────────────────
const getPegawaiQuery = (search, statusFilter) => {
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
  return { whereClause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '', params };
};

// ── GET /api/pegawai ──────────────────────────────────────────────
router.get('/pegawai', guard, async (req, res) => {
  try {
    const search = req.query.search || '';
    const statusFilter = req.query.status || '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { whereClause, params } = getPegawaiQuery(search, statusFilter);

    const [countResult] = await db.query(
      `SELECT COUNT(*) as total FROM employees e LEFT JOIN lecturers l ON e.id = l.id ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    const [data] = await db.query(
      `SELECT
         e.id, e.employee_number, e.name, e.gender, e.birth_place, e.birth_date,
         e.religion, e.marital_status, e.address, e.phone_number,
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

    res.json({
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/pegawai/:id ──────────────────────────────────────────
router.get('/pegawai/:id', guard, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         e.*,
         ou.name AS unit_name, es.name AS employment_status_name,
         IF(l.id IS NOT NULL, 'Dosen', 'Staf') AS employee_type,
         l.academic_rank, l.functional_position, l.expertise
       FROM employees e
       LEFT JOIN organization_units ou ON e.organization_unit_id = ou.id
       LEFT JOIN employment_statuses es ON e.employment_status_id = es.id
       LEFT JOIN lecturers l ON e.id = l.id
       WHERE e.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/pegawai ─────────────────────────────────────────────
router.post('/pegawai', guard, async (req, res) => {
  const {
    employee_number, national_id_number, tax_id_number, name,
    birth_place, birth_date, gender, religion, marital_status,
    address, phone_number, organization_unit_id, hire_date,
    employment_status_id, status, employee_type,
    academic_rank, functional_position, expertise
  } = req.body;

  if (!employee_number || !name || !birth_place || !birth_date || !gender ||
      !marital_status || !address || !organization_unit_id || !hire_date ||
      !employment_status_id || !status) {
    return res.status(422).json({ success: false, message: 'Field wajib tidak lengkap' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO employees
         (employee_number, national_id_number, tax_id_number, name,
          birth_place, birth_date, gender, religion, marital_status,
          address, phone_number, organization_unit_id, hire_date,
          employment_status_id, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [employee_number, national_id_number||null, tax_id_number||null, name,
       birth_place, birth_date, gender, religion||null, marital_status,
       address, phone_number||null, organization_unit_id, hire_date, employment_status_id, status]
    );
    const newId = result.insertId;
    if (employee_type === 'Dosen' && academic_rank) {
      await conn.query(
        `INSERT INTO lecturers (id, academic_rank, functional_position, expertise, created_at, updated_at)
         VALUES (?,?,?,?,NOW(),NOW())`,
        [newId, academic_rank, functional_position||null, expertise||null]
      );
    }
    await conn.commit();
    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', id: newId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/pegawai/:id ──────────────────────────────────────────
router.put('/pegawai/:id', guard, async (req, res) => {
  const { id } = req.params;
  const {
    employee_number, national_id_number, tax_id_number, name,
    birth_place, birth_date, gender, religion, marital_status,
    address, phone_number, organization_unit_id, hire_date,
    employment_status_id, status, employee_type,
    academic_rank, functional_position, expertise
  } = req.body;

  if (!employee_number || !name || !birth_place || !birth_date || !gender ||
      !marital_status || !address || !organization_unit_id || !hire_date ||
      !employment_status_id || !status) {
    return res.status(422).json({ success: false, message: 'Field wajib tidak lengkap' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [check] = await conn.query('SELECT id FROM employees WHERE id = ?', [id]);
    if (check.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await conn.query(
      `UPDATE employees SET
         employee_number=?, national_id_number=?, tax_id_number=?, name=?,
         birth_place=?, birth_date=?, gender=?, religion=?, marital_status=?,
         address=?, phone_number=?, organization_unit_id=?, hire_date=?,
         employment_status_id=?, status=?, updated_at=NOW()
       WHERE id=?`,
      [employee_number, national_id_number||null, tax_id_number||null, name,
       birth_place, birth_date, gender, religion||null, marital_status,
       address, phone_number||null, organization_unit_id, hire_date, employment_status_id, status, id]
    );

    const [existL] = await conn.query('SELECT id FROM lecturers WHERE id=?', [id]);
    if (employee_type === 'Dosen') {
      if (existL.length > 0) {
        await conn.query(
          `UPDATE lecturers SET academic_rank=?, functional_position=?, expertise=?, updated_at=NOW() WHERE id=?`,
          [academic_rank||null, functional_position||null, expertise||null, id]
        );
      } else {
        await conn.query(
          `INSERT INTO lecturers (id, academic_rank, functional_position, expertise, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())`,
          [id, academic_rank||null, functional_position||null, expertise||null]
        );
      }
    } else if (existL.length > 0) {
      await conn.query('DELETE FROM lecturers WHERE id=?', [id]);
    }

    await conn.commit();
    res.json({ success: true, message: 'Data berhasil diperbarui' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/pegawai/:id ───────────────────────────────────────
router.delete('/pegawai/:id', guard, async (req, res) => {
  const { id } = req.params;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT name FROM employees WHERE id=?', [id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await conn.query('DELETE FROM lecturers WHERE id=?', [id]);
    await conn.query('DELETE FROM employees WHERE id=?', [id]);

    await conn.commit();
    res.json({ success: true, message: `Data "${rows[0].name}" berhasil dihapus` });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
