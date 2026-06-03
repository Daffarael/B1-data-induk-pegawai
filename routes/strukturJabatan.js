const express = require('express');
const router = express.Router();
const c = require('../controllers/strukturJabatanController');
const { isAuthenticated } = require('../middlewares/auth');
const { hasRole } = require('../middlewares/acl');

// Semua route di sini dilindungi auth dan acl
router.use(isAuthenticated, hasRole('Admin Kepegawaian'));

router.get('/', c.index);
router.get('/create', c.create);
router.post('/', c.store);

// Export & Import
router.get('/export/pdf', c.exportPdf);
router.post('/import', c.upload.single('csv_file'), c.importCsv);

router.get('/:id', c.show);
router.get('/:id/edit', c.edit);
router.put('/:id', c.update);
router.delete('/:id', c.destroy);

// Tupoksi (Job Responsibilities)
router.post('/:id/tupoksi', c.storeTupoksi);
router.put('/:id/tupoksi/:tupoksi_id', c.updateTupoksi);
router.delete('/:id/tupoksi/:tupoksi_id', c.destroyTupoksi);

module.exports = router;