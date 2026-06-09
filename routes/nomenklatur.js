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

// ── Detail, Edit, Hapus Nomenklatur ──
router.get('/:id',       guard, c.show);
router.get('/:id/edit',  guard, c.edit);
router.post('/:id',      guard, (req, res, next) => {
  if (req.body._method === 'PUT')    return c.update(req, res, next);
  if (req.body._method === 'DELETE') return c.destroy(req, res, next);
  next();
});

// ── Klasifikasi (inline di halaman show) ──
router.post('/:id/klasifikasi',        guard, c.storeKlasifikasi);
router.post('/:id/klasifikasi/:kid',   guard, (req, res, next) => {
  if (req.body._method === 'PUT')    return c.updateKlasifikasi(req, res, next);
  if (req.body._method === 'DELETE') return c.destroyKlasifikasi(req, res, next);
  next();
});

module.exports = router;