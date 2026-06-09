const express = require('express');
const router = express.Router();
const c = require('../../controllers/strukturJabatanController');
const { isAuthenticated } = require('../../middlewares/auth');
const { hasRole } = require('../../middlewares/acl');

const guard = [isAuthenticated, hasRole('Admin Kepegawaian')];

// REST API endpoint - dilindungi ACL sesuai role

router.get('/', guard, c.index);
router.post('/', guard, c.store);
router.get('/:id', guard, c.show);
router.put('/:id', guard, c.update);
router.delete('/:id', guard, c.destroy);

router.post('/:id/tupoksi', guard, c.storeTupoksi);
router.put('/:id/tupoksi/:tupoksi_id', guard, c.updateTupoksi);
router.delete('/:id/tupoksi/:tupoksi_id', guard, c.destroyTupoksi);

module.exports = router;