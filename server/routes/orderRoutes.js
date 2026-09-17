const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  createRules,
  updateRules,
  listRules,
  idRule,
} = require('../validators/orderValidator');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.use(protect);
router.get('/', listRules, validate, orderController.list);
router.post('/', writeLimiter, createRules, validate, orderController.create);
router.get('/:id', idRule, validate, orderController.getOne);
router.patch('/:id', writeLimiter, updateRules, validate, orderController.update);

module.exports = router;
