const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { DELIVERY_METHODS } = require('../utils/orderStatus');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const slugRule = param('slug')
  .trim()
  .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .withMessage('That shop link is not valid.')
  .isLength({ min: 1, max: 48 })
  .withMessage('That shop link is not valid.');

const productIdRule = param('productId')
  .custom(isObjectId)
  .withMessage('That product link is not valid.');

const storefrontQueryRules = [
  slugRule,
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('category').optional().trim().isLength({ max: 40 }).withMessage('That category filter is not valid.'),
];

const productRules = [slugRule, productIdRule];

const trackEventRules = [
  slugRule,
  body('type')
    .isIn(['visit', 'product_view', 'add_to_cart'])
    .withMessage('Unknown event.'),
  body('visitorId')
    .isString()
    .matches(/^[A-Za-z0-9-]{16,64}$/)
    .withMessage('Unknown event.'),
  body('productId')
    .optional({ values: 'null' })
    .custom(isObjectId)
    .withMessage('Unknown event.'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Unknown event.'),
];

const checkoutRules = [
  slugRule,
  body('customer')
    .isObject()
    .withMessage('Please enter your details.'),
  body('customer.name')
    .trim()
    .notEmpty()
    .withMessage('Please enter your name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters.'),
  body('customer.phone')
    .trim()
    .notEmpty()
    .withMessage('Please enter your phone number.')
    .matches(/^[+0-9][0-9\s()-]{6,19}$/)
    .withMessage('Please enter a valid phone number.'),
  body('customer.email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.')
    .isLength({ max: 120 })
    .withMessage('Email is too long.'),
  body('items')
    .isArray({ min: 1, max: 30 })
    .withMessage('Your cart needs at least one product.'),
  body('items.*.productId')
    .custom(isObjectId)
    .withMessage('One of the products is not valid.'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Quantity must be a whole number from 1 to 1000.'),
  body('items').custom((items) => {
    if (!Array.isArray(items)) return true;
    const ids = items.map((item) => String(item?.productId || ''));
    if (new Set(ids).size !== ids.length) {
      throw new Error('Each product can only appear once. Increase the quantity instead.');
    }
    return true;
  }),
  body('deliveryMethod')
    .isIn(DELIVERY_METHODS)
    .withMessage('Please choose Pickup or Delivery.'),
  body('deliveryAddress').custom((value, { req }) => {
    if (req.body.deliveryMethod !== 'Delivery') return true;
    const text = String(value || '').trim();
    if (text.length < 5) {
      throw new Error('Please enter a delivery address.');
    }
    if (text.length > 400) {
      throw new Error('Delivery address must be 400 characters or fewer.');
    }
    return true;
  }),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or fewer.'),
  body('paymentMethod')
    .optional({ values: 'falsy' })
    .isIn(['qr', 'payment_link', 'instructions', 'pay_on_pickup'])
    .withMessage('Please choose a valid payment method.'),
  body('checkoutKey')
    .optional({ values: 'falsy' })
    .isString()
    .matches(/^[A-Za-z0-9_-]{32,64}$/)
    .withMessage('Please refresh the page and try again.'),
];

const confirmationRules = [
  slugRule,
  // Shape checks happen in the service so invalid tokens always get a generic 404.
  param('token').trim().notEmpty(),
];

const paymentReferenceRules = [
  slugRule,
  param('token').trim().notEmpty(),
  body('paymentReference')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Payment reference must be 120 characters or fewer.'),
  body('paymentMethod')
    .optional({ values: 'falsy' })
    .isIn(['qr', 'payment_link', 'instructions', 'pay_on_pickup'])
    .withMessage('Please choose a valid payment method.'),
];

module.exports = {
  storefrontQueryRules,
  productRules,
  trackEventRules,
  checkoutRules,
  confirmationRules,
  paymentReferenceRules,
  slugRule,
};
