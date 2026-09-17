const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  listRules,
  updateRules,
  idRule,
} = require('../validators/customerWantValidator');
const customerWantController = require('../controllers/customerWantController');

const router = express.Router();

router.use(protect);
router.get('/', listRules, validate, customerWantController.list);
router.get('/:id', idRule, validate, customerWantController.getOne);
router.patch('/:id', writeLimiter, updateRules, validate, customerWantController.update);

module.exports = router;
