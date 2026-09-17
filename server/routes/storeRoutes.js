const express = require('express');
const { publicOrderLimiter, publicWantLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  storefrontQueryRules,
  productRules,
  checkoutRules,
} = require('../validators/storeValidator');
const { publicCreateRules } = require('../validators/customerWantValidator');
const storeController = require('../controllers/storeController');

const router = express.Router();

router.get('/:slug', storefrontQueryRules, validate, storeController.getStorefront);
router.get('/:slug/products/:productId', productRules, validate, storeController.getProduct);
router.post('/:slug/orders', publicOrderLimiter, checkoutRules, validate, storeController.createOrder);
router.post('/:slug/wants', publicWantLimiter, publicCreateRules, validate, storeController.createWant);

module.exports = router;
