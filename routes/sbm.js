const express = require('express');
const router = express.Router();
const c = require('../controllers/sbmController');
const { isAuthenticated } = require('../middlewares/auth');

router.use(isAuthenticated);

// GET /sbm/api — Read-only JSON API (login required)
router.get('/api', c.apiIndex);

router.get('/export/pdf/preview',  c.previewPdf);
router.get('/export/json/preview', c.previewJson);
router.get('/export/pdf',  c.exportPdf);
router.get('/export/json', c.exportJson);
router.get('/import', (req, res) => res.redirect('/sbm'));
router.post('/import', c.upload.single('csv_file'), c.importCsv);

router.get('/',        c.index);
router.get('/create',  c.create);
router.post('/',       c.store);
router.get('/:id',     c.show);
router.get('/:id/edit', c.edit);
router.put('/:id',     c.update);
router.delete('/:id',  c.destroy);

module.exports = router;