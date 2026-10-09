const { body } = require('express-validator');
const { CATEGORY_MIN, CATEGORY_MAX, CATEGORY_PATTERN } = require('../utils/categories');

const emailRule = body('email')
  .trim()
  .notEmpty()
  .withMessage('Please enter your email.')
  .isEmail()
  .withMessage('Please enter a valid email.')
  .toLowerCase();

function strongPasswordRule(field) {
  return body(field)
    .isString()
    .isLength({ min: 8, max: 72 })
    .withMessage('Use at least 8 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must include a letter.')
    .matches(/\d/)
    .withMessage('Password must include a number.');
}

const passwordRule = strongPasswordRule('password');

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
    .isString()
    .withMessage('Please choose or type your store type.')
    .bail()
    .trim()
    .customSanitizer((value) => value.replace(/\s+/g, ' '))
    .isLength({ min: CATEGORY_MIN, max: CATEGORY_MAX })
    .withMessage(`Store type must be between ${CATEGORY_MIN} and ${CATEGORY_MAX} characters.`)
    .matches(CATEGORY_PATTERN)
    .withMessage('Use letters, numbers, spaces and simple punctuation for your store type.'),
  body('phone')
    .isString()
    .withMessage('Please enter your phone number.')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Please enter your phone number.')
    .bail()
    .matches(/^[+0-9][0-9\s()-]{6,19}$/)
    .withMessage('Please enter a valid phone number.'),
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

const forgotPasswordRules = [emailRule];

const resetPasswordRules = [
  body('token')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Invalid or expired reset link.')
    .isLength({ min: 32, max: 200 })
    .withMessage('Invalid or expired reset link.'),
  passwordRule,
  body('confirmPassword')
    .isString()
    .notEmpty()
    .withMessage('Please confirm your password.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

const changePasswordRules = [
  body('currentPassword')
    .isString()
    .withMessage('Please enter your current password.')
    .bail()
    .notEmpty()
    .withMessage('Please enter your current password.')
    .isLength({ max: 72 })
    .withMessage('Your current password is incorrect.'),
  strongPasswordRule('newPassword')
    .bail()
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('Choose a password different from your current one.');
      }
      return true;
    }),
  body('confirmPassword')
    .isString()
    .notEmpty()
    .withMessage('Please confirm your new password.')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
];

const verifyEmailRules = [
  body('token')
    .isString()
    .trim()
    .isLength({ min: 32, max: 200 })
    .withMessage('This verification link is invalid or has already been used.'),
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  changePasswordRules,
  verifyEmailRules,
};
