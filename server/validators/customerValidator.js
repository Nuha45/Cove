const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const idRule = param('id')
  .custom(isObjectId)
  .withMessage('That customer link is not valid.');

const listRules = [
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 24 }).withMessage('Please request between 1 and 24 customers.'),
];

const updateRules = [
  idRule,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Please enter the customer name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters.'),
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
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or fewer.'),
  body().custom((value) => {
    if (!value || (
      value.name === undefined
      && value.phone === undefined
      && value.email === undefined
      && value.notes === undefined
    )) {
      throw new Error('Please change something on the customer.');
    }
    return true;
  }),
];

const orderListRules = [
  idRule,
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 24 }).withMessage('Please request between 1 and 24 orders.'),
];

module.exports = {
  idRule,
  listRules,
  updateRules,
  orderListRules,
};
