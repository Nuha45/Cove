const { body } = require('express-validator');
const { CATEGORIES } = require('../utils/categories');
const { CURRENCIES } = require('../utils/currencies');
const { isValidUpiId, normalizeUpiId } = require('../utils/upi');
const {
  STOREFRONT_THEMES,
  STOREFRONT_ACCENTS,
} = require('../utils/storefrontAppearance');

const ACCENT_VALUES = STOREFRONT_ACCENTS.map((item) => item.value.toLowerCase());

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
      if (value.startsWith('data:image/') || value.startsWith('/uploads/logos/')) return true;
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
      if (!/^#[0-9A-Fa-f]{6}$/.test(value) || !ACCENT_VALUES.includes(value.toLowerCase())) {
        throw new Error('Please choose one of the available accent colors.');
      }
      return true;
    }),
  body('storefrontCoverImage')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === '') return true;
      if (typeof value !== 'string') throw new Error('Please upload a JPG, PNG, or WebP image.');
      if (value.startsWith('data:image/') || value.startsWith('/uploads/covers/')) return true;
      throw new Error('Please upload a JPG, PNG, or WebP image.');
    }),
  optionalBoolean('paymentQrEnabled', 'QR payment setting is not valid.'),
  optionalBoolean('paymentLinkEnabled', 'Payment link setting is not valid.'),
  optionalBoolean('paymentInstructionsEnabled', 'Payment instructions setting is not valid.'),
  optionalBoolean('payOnPickupEnabled', 'Pay on pickup setting is not valid.'),
  optionalBoolean('emailNewOrders', 'New order email setting is not valid.'),
  optionalBoolean('emailPayments', 'Payment email setting is not valid.'),
  optionalBoolean('emailCustomerWants', 'Customer Want email setting is not valid.'),
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
      if (value.startsWith('data:image/') || value.startsWith('/uploads/payment-qr/')) return true;
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
      'storefrontTheme', 'storefrontAccent', 'storefrontCoverImage',
      ...PAYMENT_FIELDS,
    ];
    if (!allowed.some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error('Please change at least one setting.');
    }
    return true;
  }),
];

module.exports = { updateSettingsRules };
