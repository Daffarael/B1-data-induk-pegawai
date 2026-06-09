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
router.get('/export/json', c.exportJson);
router.post('/import', (req, res, next) => {
    c.upload.single('csv_file')(req, res, (err) => {
        if (err) {
            req.flash('error', 'Gagal upload file: ' + err.message);
            return res.redirect('/struktur-jabatan');
        }
        next();
    });
}, c.importCsv);

router.get('/:id', c.show);
router.get('/:id/edit', c.edit);
router.put('/:id', c.update);
router.delete('/:id', c.destroy);
router.post('/:id', (req, res, next) => {
    if (req.body._method === 'PUT') return c.update(req, res, next);
    if (req.body._method === 'DELETE') return c.destroy(req, res, next);
    next();
});

// Tupoksi (Job Responsibilities)
router.post('/:id/tupoksi', c.storeTupoksi);
router.put('/:id/tupoksi/:tupoksi_id', c.updateTupoksi);
router.delete('/:id/tupoksi/:tupoksi_id', c.destroyTupoksi);
router.post('/:id/tupoksi/:tupoksi_id', (req, res, next) => {
    if (req.body._method === 'PUT') return c.updateTupoksi(req, res, next);
    if (req.body._method === 'DELETE') return c.destroyTupoksi(req, res, next);
    next();
});

module.exports = router;