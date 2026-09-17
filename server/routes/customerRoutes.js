const express = require('express');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  listRules,
  updateRules,
  idRule,
  orderListRules,
} = require('../validators/customerValidator');
const customerController = require('../controllers/customerController');

const router = express.Router();

router.use(protect);
router.get('/', listRules, validate, customerController.list);
router.get('/:id', idRule, validate, customerController.getOne);
router.get('/:id/orders', orderListRules, validate, customerController.listOrders);
router.patch('/:id', writeLimiter, updateRules, validate, customerController.update);

module.exports = router;
