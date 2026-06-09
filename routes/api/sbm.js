const express = require('express');
const router = express.Router();
const db = require('../../lib/db');
const { isAuthenticated } = require('../../middlewares/auth');
const { hasRole } = require('../../middlewares/acl');

const guard = [isAuthenticated, hasRole('Admin Kepegawaian')];

// GET /api/sbm — Daftar semua SBM
router.get('/', guard, async (req, res) => {
  try {
    const search = req.query.search || '';
    const page   = parseInt(req.query.page) || 1;
    const limit  = parseInt(req.query.limit) || 10;
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

    const [data] = await db.query(
      `SELECT tcs.id, ci.name AS kota, tc.name AS komponen, tc.code AS kode_komponen,
              sp.name AS jabatan, eg.name AS golongan, tcs.amount,
              tcs.city_id, tcs.travel_cost_component_id,
              tcs.structural_position_id, tcs.employee_grade_id
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

    res.json({
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sbm/:id — Detail satu SBM
router.get('/:id', guard, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tcs.id, ci.name AS kota, tc.name AS komponen, tc.code AS kode_komponen,
              sp.name AS jabatan, eg.name AS golongan, tcs.amount,
              tcs.city_id, tcs.travel_cost_component_id,
              tcs.structural_position_id, tcs.employee_grade_id
       FROM travel_cost_standards tcs
       JOIN cities ci ON ci.id = tcs.city_id
       JOIN travel_cost_components tc ON tc.id = tcs.travel_cost_component_id
       LEFT JOIN structural_positions sp ON sp.id = tcs.structural_position_id
       LEFT JOIN employee_grades eg ON eg.id = tcs.employee_grade_id
       WHERE tcs.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/sbm — Tambah SBM baru
router.post('/', guard, async (req, res) => {
  const { city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount } = req.body;

  if (!city_id || !travel_cost_component_id || !amount) {
    return res.status(422).json({
      success: false,
      message: 'city_id, travel_cost_component_id, dan amount wajib diisi'
    });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO travel_cost_standards
         (city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [city_id, travel_cost_component_id, structural_position_id || null, employee_grade_id || null, amount]
    );
    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/sbm/:id — Update SBM
router.put('/:id', guard, async (req, res) => {
  const { id } = req.params;
  const { city_id, travel_cost_component_id, structural_position_id, employee_grade_id, amount } = req.body;

  if (!city_id || !travel_cost_component_id || !amount) {
    return res.status(422).json({
      success: false,
      message: 'city_id, travel_cost_component_id, dan amount wajib diisi'
    });
  }

  try {
    const [exist] = await db.query('SELECT id FROM travel_cost_standards WHERE id = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await db.query(
      `UPDATE travel_cost_standards SET
         city_id=?, travel_cost_component_id=?, structural_position_id=?, employee_grade_id=?, amount=?, updated_at=NOW()
       WHERE id=?`,
      [city_id, travel_cost_component_id, structural_position_id || null, employee_grade_id || null, amount, id]
    );
    res.json({ success: true, message: 'Data berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/sbm/:id — Hapus SBM
router.delete('/:id', guard, async (req, res) => {
  try {
    const [exist] = await db.query('SELECT id FROM travel_cost_standards WHERE id = ?', [req.params.id]);
    if (exist.length === 0) return res.status(404).json({ success: false, message: 'Data tidak ditemukan' });

    await db.query('DELETE FROM travel_cost_standards WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;