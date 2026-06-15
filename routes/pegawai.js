const express = require('express');
const router = express.Router();
const pegawaiController = require('../controllers/pegawaiController');
const { isAuthenticated } = require('../middlewares/auth');
const { hasRole } = require('../middlewares/acl');

// Semua route pegawai wajib login + role Admin Kepegawaian
const guard = [isAuthenticated, hasRole('Admin Kepegawaian')];

// GET  /pegawai              — Daftar pegawai
router.get('/', guard, pegawaiController.index);

// GET  /pegawai/export/pdf/preview — Preview PDF sebelum unduh
router.get('/export/pdf/preview', guard, pegawaiController.previewPdf);

// GET  /pegawai/export/pdf   — Export PDF (langsung unduh, dipanggil dari preview)
router.get('/export/pdf', guard, pegawaiController.exportPdf);

// GET  /pegawai/export/json/preview — Preview JSON sebelum unduh
router.get('/export/json/preview', guard, pegawaiController.previewJson);

// GET  /pegawai/export/json  — Export JSON (langsung unduh, dipanggil dari preview)
router.get('/export/json', guard, pegawaiController.exportJson);

// POST /pegawai/import       — Import CSV
router.post('/import', guard, pegawaiController.upload.single('csv_file'), pegawaiController.importCsv);

// GET  /pegawai/api          — Read-only JSON API (login required)
router.get('/api', isAuthenticated, pegawaiController.apiIndex);

// GET  /pegawai/create       — Form tambah
router.get('/create', guard, pegawaiController.create);

// POST /pegawai              — Simpan data baru
router.post('/', guard, pegawaiController.store);

// GET  /pegawai/:id          — Detail pegawai
router.get('/:id', guard, pegawaiController.show);

// GET  /pegawai/:id/edit     — Form edit
router.get('/:id/edit', guard, pegawaiController.edit);

// PUT /pegawai/:id — Update
router.put('/:id', guard, pegawaiController.update);

// DELETE /pegawai/:id — Delete
router.delete('/:id', guard, pegawaiController.destroy);

module.exports = router;
