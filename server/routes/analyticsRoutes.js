const express = require('express');
const { protect } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const { requireAdvanced } = require('../middleware/requireAdvanced');
const { exportLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { rangeRules } = require('../validators/analyticsValidator');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

router.use(protect, requireVerifiedEmail);
router.get('/', analyticsController.getOverview);

// Cove Plus analytics. Every query is scoped to the session business.
router.get('/performance', requireAdvanced, rangeRules, validate, analyticsController.getPerformance);
router.get('/products', requireAdvanced, rangeRules, validate, analyticsController.getProductPerformance);
router.get('/insights', requireAdvanced, rangeRules, validate, analyticsController.getInsights);
router.get('/sales-report', requireAdvanced, rangeRules, validate, analyticsController.getSalesReport);
router.get('/export/orders.csv', exportLimiter, requireAdvanced, rangeRules, validate, analyticsController.exportOrders);
router.get(
  '/export/product-sales.csv',
  exportLimiter,
  requireAdvanced,
  rangeRules,
  validate,
  analyticsController.exportProductSales
);

module.exports = router;
