const express = require('express');
const router = express.Router();
const c = require('../../controllers/sbmController');

router.get('/', c.index);
router.post('/', c.store);
router.get('/:id', c.show);
router.put('/:id', c.update);
router.delete('/:id', c.destroy);

module.exports = router;