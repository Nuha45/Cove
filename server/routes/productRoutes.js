const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const { writeLimiter, exportLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  createRules,
  updateRules,
  listRules,
  idRule,
} = require('../validators/productValidator');
const productController = require('../controllers/productController');
const { requireAdvanced } = require('../middleware/requireAdvanced');
const { BULK_ACTIONS } = require('../services/productService');

const router = express.Router();

const bulkRules = [
  body('ids')
    .isArray({ min: 1, max: 100 })
    .withMessage('Select between 1 and 100 products.'),
  body('ids.*')
    .isMongoId()
    .withMessage('One of the selected products is not valid.'),
  body('action')
    .isIn(BULK_ACTIONS)
    .withMessage('Choose a valid bulk action.'),
];

router.use(protect, requireVerifiedEmail);
router.get('/', listRules, validate, productController.list);
router.post('/', writeLimiter, createRules, validate, productController.create);
router.get('/inventory', requireAdvanced, productController.inventory);
router.get('/export.csv', exportLimiter, requireAdvanced, productController.exportCsv);
router.post('/bulk', writeLimiter, requireAdvanced, bulkRules, validate, productController.bulkUpdate);
router.get('/:id', idRule, validate, productController.getOne);
router.patch('/:id', writeLimiter, updateRules, validate, productController.update);
router.delete('/:id', writeLimiter, idRule, validate, productController.remove);

module.exports = router;
