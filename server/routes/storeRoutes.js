const express = require('express');
const {
  publicOrderLimiter,
  publicWantLimiter,
  publicConfirmationLimiter,
  publicWantBoardLimiter,
  publicWantVoteLimiter,
} = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const {
  storefrontQueryRules,
  productRules,
  checkoutRules,
  confirmationRules,
  paymentReferenceRules,
} = require('../validators/storeValidator');
const {
  publicCreateRules,
  boardListRules,
  boardVoteRules,
} = require('../validators/customerWantValidator');
const storeController = require('../controllers/storeController');

const router = express.Router();

router.get('/:slug', storefrontQueryRules, validate, storeController.getStorefront);
router.get('/:slug/products/:productId', productRules, validate, storeController.getProduct);
router.get(
  '/:slug/orders/confirm/:token',
  publicConfirmationLimiter,
  confirmationRules,
  validate,
  storeController.getOrderConfirmation
);
router.post(
  '/:slug/orders/confirm/:token/payment',
  publicConfirmationLimiter,
  paymentReferenceRules,
  validate,
  storeController.submitPaymentReference
);
router.post('/:slug/orders', publicOrderLimiter, checkoutRules, validate, storeController.createOrder);
router.post('/:slug/wants', publicWantLimiter, publicCreateRules, validate, storeController.createWant);
router.get(
  '/:slug/want-board',
  publicWantBoardLimiter,
  boardListRules,
  validate,
  storeController.listWantBoard
);
router.post(
  '/:slug/want-board/:wantId/votes',
  publicWantVoteLimiter,
  boardVoteRules,
  validate,
  storeController.voteWantBoard
);

module.exports = router;
