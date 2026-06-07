
const express = require('express');
const router = express.Router();
const db = require('../../lib/db');

// GET /api/nomenklatur - Ambil semua nomenklatur
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, COUNT(nc.id) AS jumlah_klasifikasi
      FROM nomenclatures n
      LEFT JOIN nomenclature_classifications nc ON nc.nomenclature_id = n.id
      GROUP BY n.id
      ORDER BY n.name ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/nomenklatur/:id - Ambil detail nomenklatur + klasifikasinya
router.get('/:id', async (req, res) => {
  try {
    const [[nom]] = await db.query('SELECT * FROM nomenclatures WHERE id = ?', [req.params.id]);
    if (!nom) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });

    const [klasifikasi] = await db.query(
      'SELECT * FROM nomenclature_classifications WHERE nomenclature_id = ? ORDER BY name ASC',
      [req.params.id]
    );
    res.json({ success: true, data: { ...nom, klasifikasi } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/nomenklatur - Tambah nomenklatur
router.post('/', async (req, res) => {
  const { name, qualification, duties, grade } = req.body;
  if (!name || !qualification || !duties || !grade) {
    return res.status(400).json({ success: false, error: 'name, qualification, duties, dan grade wajib diisi' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO nomenclatures (name, qualification, duties, grade, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [name.trim(), qualification.trim(), duties.trim(), grade.trim()]
    );
    res.status(201).json({ success: true, message: 'Data berhasil ditambahkan', id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/nomenklatur/:id - Update nomenklatur
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, qualification, duties, grade } = req.body;
  if (!name || !qualification || !duties || !grade) {
    return res.status(400).json({ success: false, error: 'name, qualification, duties, dan grade wajib diisi' });
  }
  try {
    const [[exist]] = await db.query('SELECT id FROM nomenclatures WHERE id = ?', [id]);
    if (!exist) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });

    await db.query(
      'UPDATE nomenclatures SET name=?, qualification=?, duties=?, grade=?, updated_at=NOW() WHERE id=?',
      [name.trim(), qualification.trim(), duties.trim(), grade.trim(), id]
    );
    res.json({ success: true, message: 'Data berhasil diupdate' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/nomenklatur/:id - Hapus nomenklatur
router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const [[exist]] = await conn.query('SELECT name FROM nomenclatures WHERE id = ?', [req.params.id]);
    if (!exist) return res.status(404).json({ success: false, error: 'Data tidak ditemukan' });

    await conn.beginTransaction();
    await conn.query('DELETE FROM nomenclature_classifications WHERE nomenclature_id = ?', [req.params.id]);
    await conn.query('DELETE FROM nomenclatures WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ success: true, message: 'Data berhasil dihapus' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;