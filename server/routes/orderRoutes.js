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
const invoiceController = require('../controllers/invoiceController');
const { requireAdvanced } = require('../middleware/requireAdvanced');
const { requireOpenStore } = require('../middleware/requireOpenStore');

const router = express.Router();

router.use(protect);
router.get('/', listRules, validate, orderController.list);
router.post('/', writeLimiter, requireOpenStore, createRules, validate, orderController.create);
router.get('/:id', idRule, validate, orderController.getOne);
router.get('/:id/invoice', requireAdvanced, idRule, validate, invoiceController.getForOrder);
router.get('/:id/invoice/pdf', requireAdvanced, idRule, validate, invoiceController.getOrderPdf);
router.patch('/:id', writeLimiter, updateRules, validate, orderController.update);

module.exports = router;
