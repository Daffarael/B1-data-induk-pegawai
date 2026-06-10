const express = require('express');
const router = express.Router();
const mahasiswaController = require('../controllers/mahasiswaController');
const { isAuthenticated } = require('../middlewares/auth');
const { hasRole } = require('../middlewares/acl');

// Hanya admin kemahasiswaan yang boleh mengakses modul ini
router.use(isAuthenticated);
router.use(hasRole('Admin Kemahasiswaan'));

// GET /mahasiswa
router.get('/', mahasiswaController.index);

// GET /mahasiswa/export/pdf
router.get('/export/pdf', mahasiswaController.exportPdf);

// GET /mahasiswa/export/json
router.get('/export/json', mahasiswaController.exportJson);

// POST /mahasiswa/import
router.post('/import', (req, res, next) => {
  mahasiswaController.upload.single('file')(req, res, (err) => {
    if (err) {
      req.flash('error', `File ditolak: ${err.message}`);
      return res.redirect('/mahasiswa');
    }
    next();
  });
}, mahasiswaController.importCsv);

// GET /mahasiswa/create
router.get('/create', mahasiswaController.create);

// POST /mahasiswa
router.post('/', mahasiswaController.store);

// GET /mahasiswa/:id/edit
router.get('/:id/edit', mahasiswaController.edit);

// PUT /mahasiswa/:id (atau POST dari form dengan overide method/langsung POST jika EJS biasa)
// Karena EJS biasa memakai POST, kita tangkap POST dengan akhiran update jika mau gampang
// Tapi lebih baik tetap POST /mahasiswa/:id untuk update kalau tidak pakai method-override
router.post('/:id/update', mahasiswaController.update);

// DELETE /mahasiswa/:id untuk delete
router.delete('/:id', mahasiswaController.destroy);

// GET /mahasiswa/:id
router.get('/:id', mahasiswaController.show);

module.exports = router;