const express = require('express');
const router = express.Router();
const c = require('../controllers/nomenklaturController');
const { isAuthenticated } = require('../middlewares/auth');
const { hasRole } = require('../middlewares/acl');

const guard = [isAuthenticated, hasRole('Admin Kepegawaian')];

// ── Daftar & tambah ──
router.get('/',          guard, c.index);
router.get('/create',    guard, c.create);
router.post('/',         guard, c.store);

// ── Export & Import ──
router.get('/export/pdf',  guard, c.exportPdf);
router.get('/export/json', guard, c.exportJson);
router.post('/import',     guard, c.upload.single('csv_file'), c.importCsv);

// GET  /nomenklatur/api          — Public API: daftar nomenklatur (JSON, tanpa login)
router.get('/api', c.apiIndex);

// GET  /nomenklatur/api/:id      — Public API: detail nomenklatur (JSON, tanpa login)
router.get('/api/:id', c.apiShow);

// ── Detail, Edit, Hapus Nomenklatur ──
router.get('/:id',        guard, c.show);
router.get('/:id/edit',   guard, c.edit);
router.put('/:id',        guard, c.update);
router.delete('/:id',     guard, c.destroy);

// ── Klasifikasi (inline di halaman show) ──
router.post('/:id/klasifikasi',              guard, c.storeKlasifikasi);
router.put('/:id/klasifikasi/:kid',          guard, c.updateKlasifikasi);
router.delete('/:id/klasifikasi/:kid',       guard, c.destroyKlasifikasi);

module.exports = router;