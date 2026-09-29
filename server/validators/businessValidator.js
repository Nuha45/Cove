const { body } = require('express-validator');
const { CATEGORIES } = require('../utils/categories');
const { CURRENCIES } = require('../utils/currencies');
const { isValidUpiId, normalizeUpiId } = require('../utils/upi');
const { isAcceptedImageValue } = require('../utils/imageUpload');
const {
  STOREFRONT_THEMES,
  isValidAccent,
  isValidBackground,
} = require('../utils/storefrontAppearance');

function optionalBoolean(field, message) {
  return body(field)
    .optional()
    .custom((value) => {
      if (typeof value === 'boolean') return true;
      if (value === 'true' || value === 'false') return true;
      throw new Error(message);
    });
}

const PAYMENT_FIELDS = [
  'paymentQrEnabled',
  'paymentLinkEnabled',
  'paymentInstructionsEnabled',
  'payOnPickupEnabled',
  'paymentLink',
  'paymentQrImage',
  'paymentUpiId',
  'paymentInstructions',
  'emailNewOrders',
  'emailPayments',
  'emailCustomerWants',
];

const NOTIFICATION_FIELDS = [
  'emailLowStock',
  'emailWeeklyReport',
  'emailOrderConfirmation',
  'emailOrderUpdates',
  'lowStockThreshold',
];

const PROMOTION_FIELDS = [
  'storefrontAnnouncement',
  'storefrontPromoTitle',
  'storefrontPromoText',
  'storefrontFeaturedProductIds',
  'storefrontFeaturedCategories',
];

const updateSettingsRules = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Please enter your business name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Business name must be between 2 and 80 characters.'),
  body('slug')
    .optional()
    .trim()
    .toLowerCase()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Use lowercase letters, numbers, and hyphens only.')
    .isLength({ min: 2, max: 48 })
    .withMessage('Storefront link must be between 2 and 48 characters.'),
  body('category')
    .optional()
    .isIn(CATEGORIES)
    .withMessage('Please choose a valid category.'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description must be 300 characters or fewer.'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[+0-9][0-9\s()-]{6,19}$/)
    .withMessage('Please enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.')
    .isLength({ max: 120 })
    .withMessage('Email is too long.'),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 60 })
    .withMessage('City must be 60 characters or fewer.'),
  body('logo')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Please upload a JPG, PNG, or WebP image.');
      if (isAcceptedImageValue('logos', value)) return true;
      throw new Error('Please upload a JPG, PNG, or WebP image.');
    }),
  body('currency')
    .optional()
    .isIn(CURRENCIES)
    .withMessage('Please choose a supported currency.'),
  optionalBoolean('pickupEnabled', 'Pickup setting is not valid.'),
  optionalBoolean('deliveryEnabled', 'Delivery setting is not valid.'),
  optionalBoolean('storefrontActive', 'Storefront setting is not valid.'),
  body('storefrontTheme')
    .optional()
    .trim()
    .toLowerCase()
    .isIn(STOREFRONT_THEMES)
    .withMessage('Please choose a valid storefront theme.'),
  body('storefrontAccent')
    .optional()
    .trim()
    .custom((value) => {
      if (typeof value !== 'string' || !isValidAccent(value)) {
        throw new Error('Please choose one of the available accent colors.');
      }
      return true;
    }),
  body('storefrontBackground')
    .optional()
    .custom((value) => {
      if (typeof value !== 'string' || !isValidBackground(value.trim())) {
        throw new Error('Please choose one of the available background colors.');
      }
      return true;
    }),
  body('storefrontCoverImage')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Please upload a JPG, PNG, or WebP image.');
      if (isAcceptedImageValue('covers', value)) return true;
      throw new Error('Please upload a JPG, PNG, or WebP image.');
    }),
  body('storefrontCoverFocusX')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Cover position must be between 0 and 100.'),
  body('storefrontCoverFocusY')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Cover position must be between 0 and 100.'),
  optionalBoolean('paymentQrEnabled', 'QR payment setting is not valid.'),
  optionalBoolean('paymentLinkEnabled', 'Payment link setting is not valid.'),
  optionalBoolean('paymentInstructionsEnabled', 'Payment instructions setting is not valid.'),
  optionalBoolean('payOnPickupEnabled', 'Pay on pickup setting is not valid.'),
  optionalBoolean('emailNewOrders', 'New order email setting is not valid.'),
  optionalBoolean('emailPayments', 'Payment email setting is not valid.'),
  optionalBoolean('emailCustomerWants', 'Customer request email setting is not valid.'),
  optionalBoolean('emailLowStock', 'Low stock email setting is not valid.'),
  optionalBoolean('emailWeeklyReport', 'Weekly report email setting is not valid.'),
  optionalBoolean('emailOrderConfirmation', 'Order confirmation email setting is not valid.'),
  optionalBoolean('emailOrderUpdates', 'Order update email setting is not valid.'),
  body('lowStockThreshold')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Low stock level must be a whole number between 0 and 1000.')
    .toInt(),
  body('storefrontAnnouncement')
    .optional()
    .isString()
    .withMessage('Announcement is not valid.')
    .trim()
    .isLength({ max: 140 })
    .withMessage('Announcement must be 140 characters or fewer.'),
  body('storefrontPromoTitle')
    .optional()
    .isString()
    .withMessage('Promotion title is not valid.')
    .trim()
    .isLength({ max: 60 })
    .withMessage('Promotion title must be 60 characters or fewer.'),
  body('storefrontPromoText')
    .optional()
    .isString()
    .withMessage('Promotion message is not valid.')
    .trim()
    .isLength({ max: 200 })
    .withMessage('Promotion message must be 200 characters or fewer.'),
  body('storefrontFeaturedProductIds')
    .optional()
    .isArray({ max: 8 })
    .withMessage('You can feature up to 8 products.'),
  body('storefrontFeaturedProductIds.*')
    .isMongoId()
    .withMessage('One of the featured products is not valid.'),
  body('storefrontFeaturedCategories')
    .optional()
    .isArray({ max: 6 })
    .withMessage('You can feature up to 6 categories.'),
  body('storefrontFeaturedCategories.*')
    .isString()
    .trim()
    .isLength({ min: 1, max: 40 })
    .withMessage('One of the featured categories is not valid.'),
  body('deliveryFee')
    .optional()
    .custom((value) => {
      const fee = Number(value);
      if (!Number.isFinite(fee) || fee < 0) {
        throw new Error('Delivery fee cannot be negative.');
      }
      if (fee > 100000) {
        throw new Error('Delivery fee is too high.');
      }
      return true;
    }),
  body('paymentLink')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Payment link must be 500 characters or fewer.')
    .custom((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('invalid');
        }
        return true;
      } catch {
        throw new Error('Please enter a valid payment link starting with https://');
      }
    }),
  body('paymentQrImage')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Please upload a JPG, PNG, or WebP image.');
      if (isAcceptedImageValue('payment-qr', value)) return true;
      throw new Error('Please upload a JPG, PNG, or WebP image.');
    }),
  body('paymentUpiId')
    .optional({ values: 'falsy' })
    .trim()
    .customSanitizer((value) => normalizeUpiId(value))
    .custom((value) => {
      if (!value) return true;
      if (!isValidUpiId(value)) {
        throw new Error('Enter a valid UPI ID like name@oksbi or shop@paytm.');
      }
      return true;
    })
    .isLength({ max: 320 })
    .withMessage('UPI ID is too long.'),
  body('paymentInstructions')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Payment instructions must be 1000 characters or fewer.'),
  body().custom((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Please change at least one setting.');
    }
    const allowed = [
      'name', 'slug', 'category', 'description', 'phone', 'email', 'city',
      'logo', 'currency', 'pickupEnabled', 'deliveryEnabled', 'deliveryFee', 'storefrontActive',
      'storefrontTheme', 'storefrontAccent', 'storefrontBackground', 'storefrontCoverImage',
      'storefrontCoverFocusX', 'storefrontCoverFocusY',
      ...PAYMENT_FIELDS,
      ...NOTIFICATION_FIELDS,
      ...PROMOTION_FIELDS,
    ];
    if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error('Please change at least one setting.');
    }
    return true;
  }),
];

module.exports = { updateSettingsRules, NOTIFICATION_FIELDS, PROMOTION_FIELDS };
