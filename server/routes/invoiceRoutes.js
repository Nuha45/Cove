const express = require('express');
const { param, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { requireAdvanced } = require('../middleware/requireAdvanced');
const validate = require('../middleware/validate');
const invoiceController = require('../controllers/invoiceController');

const router = express.Router();

const listRules = [
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('Page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit is not valid.'),
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
];
const idRule = [param('id').isMongoId().withMessage('We could not find that invoice.')];

router.use(protect, requireAdvanced);
router.get('/', listRules, validate, invoiceController.list);
router.get('/:id/pdf', idRule, validate, invoiceController.getPdf);

module.exports = router;
