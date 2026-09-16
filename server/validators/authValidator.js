const { body } = require('express-validator');
const { CATEGORIES } = require('../utils/categories');

const emailRule = body('email')
  .trim()
  .notEmpty()
  .withMessage('Please enter your email.')
  .isEmail()
  .withMessage('Please enter a valid email.')
  .toLowerCase();

const passwordRule = body('password')
  .isString()
  .isLength({ min: 8, max: 72 })
  .withMessage('Use at least 8 characters.')
  .matches(/[A-Za-z]/)
  .withMessage('Password must include a letter.')
  .matches(/\d/)
  .withMessage('Password must include a number.');

const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Please enter your name.')
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),
  emailRule,
  passwordRule,
  body('businessName')
    .trim()
    .notEmpty()
    .withMessage('Please enter your business name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Business name must be between 2 and 80 characters.'),
  body('category')
    .isIn(CATEGORIES)
    .withMessage('Please choose a business category.'),
  body('phone')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number is too long.'),
  body('city')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 60 })
    .withMessage('City name is too long.'),
];

const loginRules = [
  emailRule,
  body('password').isString().notEmpty().withMessage('Please enter your password.'),
];

module.exports = { registerRules, loginRules };
