
const express = require('express');
const router = express.Router();
const db = require('../../lib/db');

// GET /api/mahasiswa - Ambil semua mahasiswa
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, ou.name AS department_name 
      FROM students s
      LEFT JOIN organization_units ou ON s.department_id = ou.id
      ORDER BY s.regno ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/mahasiswa/:id - Ambil detail mahasiswa
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, ou.name AS department_name, e.name AS advisor_name
      FROM students s
      LEFT JOIN organization_units ou ON s.department_id = ou.id
      LEFT JOIN employees e ON s.advisor_id = e.id
      WHERE s.id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mahasiswa - Tambah mahasiswa
router.post('/', async (req, res) => {
  const { regno, name, department_id, year, gender, status } = req.body;
  if (!regno || !name) {
    return res.status(400).json({ success: false, error: 'regno dan name wajib diisi' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [exist] = await conn.query('SELECT id FROM students WHERE regno = ?', [regno]);
    if (exist.length > 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'regno sudah ada' });
    }

    const [maxResult] = await conn.query('SELECT MAX(id) as maxId FROM students');
    const newId = (maxResult[0].maxId || 0) + 1;

    await conn.query(
      `INSERT INTO students (id, regno, name, department_id, year, gender, status, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [newId, regno, name, department_id || null, year || null, gender || null, status || null]
    );
    await conn.commit();
    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', id: newId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/mahasiswa/:id - Update mahasiswa
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { regno, name, department_id, year, gender, status } = req.body;
  
  if (!regno || !name) {
    return res.status(400).json({ success: false, error: 'regno dan name wajib diisi' });
  }

  try {
    const [exist] = await db.query('SELECT id FROM students WHERE id = ?', [id]);
    if (exist.length === 0) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });

    const [existRegno] = await db.query('SELECT id FROM students WHERE regno = ? AND id != ?', [regno, id]);
    if (existRegno.length > 0) return res.status(400).json({ success: false, error: 'regno sudah dipakai' });

    await db.query(
      `UPDATE students SET regno=?, name=?, department_id=?, year=?, gender=?, status=?, updated_at=NOW() WHERE id=?`,
      [regno, name, department_id || null, year || null, gender || null, status || null, id]
    );
    res.json({ success: true, message: 'Data berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/mahasiswa/:id - Hapus mahasiswa
router.delete('/:id', async (req, res) => {
  try {
    const [exist] = await db.query('SELECT id FROM students WHERE id = ?', [req.params.id]);
    if (exist.length === 0) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });

    await db.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;