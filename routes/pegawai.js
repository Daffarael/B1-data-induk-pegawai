const express = require('express');
const router = express.Router();
const pegawaiController = require('../controllers/pegawaiController');
const { isAuthenticated } = require('../middlewares/auth');
const { hasRole } = require('../middlewares/acl');

// Semua route pegawai wajib login + role Admin Kepegawaian
const guard = [isAuthenticated, hasRole('Admin Kepegawaian')];

// GET  /pegawai              — Daftar pegawai
router.get('/', guard, pegawaiController.index);

// GET  /pegawai/export/pdf   — Export PDF (harus SEBELUM /:id agar tidak bentrok)
router.get('/export/pdf', guard, pegawaiController.exportPdf);

// POST /pegawai/import       — Import CSV
router.post('/import', guard, pegawaiController.upload.single('csv_file'), pegawaiController.importCsv);

// GET  /pegawai/create       — Form tambah
router.get('/create', guard, pegawaiController.create);

// POST /pegawai              — Simpan data baru
router.post('/', guard, pegawaiController.store);

// GET  /pegawai/:id          — Detail pegawai
router.get('/:id', guard, pegawaiController.show);

// GET  /pegawai/:id/edit     — Form edit
router.get('/:id/edit', guard, pegawaiController.edit);

// POST /pegawai/:id?_method=PUT — Update (HTML form tidak support PUT)
router.post('/:id', guard, (req, res, next) => {
  if (req.body._method === 'PUT') return pegawaiController.update(req, res, next);
  if (req.body._method === 'DELETE') return pegawaiController.destroy(req, res, next);
  next();
});

module.exports = router;
