const express = require('express');
const router = express.Router();
const c = require('../../controllers/strukturJabatanController');

// REST API endpoint - biasanya diproteksi dengan API Key / token
// Untuk simulasi ini, kita anggap terbuka atau bisa ditambahkan middleware lain

router.get('/', c.index);
router.post('/', c.store);
router.get('/:id', c.show);
router.put('/:id', c.update);
router.delete('/:id', c.destroy);

router.post('/:id/tupoksi', c.storeTupoksi);
router.put('/:id/tupoksi/:tupoksi_id', c.updateTupoksi);
router.delete('/:id/tupoksi/:tupoksi_id', c.destroyTupoksi);

module.exports = router;