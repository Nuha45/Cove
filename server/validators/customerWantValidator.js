const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const { STATUSES } = require('../utils/customerWantStatus');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

const slugRule = param('slug')
  .trim()
  .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .withMessage('That shop link is not valid.')
  .isLength({ min: 1, max: 48 })
  .withMessage('That shop link is not valid.');

const idRule = param('id')
  .custom(isObjectId)
  .withMessage('That request link is not valid.');

const wantIdRule = param('wantId')
  .custom(isObjectId)
  .withMessage('That request link is not valid.');

const publicCreateRules = [
  slugRule,
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Please enter your name.')
    .isLength({ min: 2, max: 80 })
    .withMessage('Name must be between 2 and 80 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Please enter your phone number.')
    .matches(/^[+0-9][0-9\s()-]{6,19}$/)
    .withMessage('Please enter a valid phone number.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.')
    .isLength({ max: 120 })
    .withMessage('Email is too long.'),
  body('request')
    .trim()
    .notEmpty()
    .withMessage('Please tell us what you are looking for.')
    .isLength({ min: 2, max: 500 })
    .withMessage('Your request must be between 2 and 500 characters.'),
  body('quantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100000 })
    .withMessage('Quantity must be a whole number from 1 to 100,000.'),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or fewer.'),
  body('shareOnBoardOptIn')
    .optional()
    .custom((value) => {
      if (typeof value === 'boolean') return true;
      if (value === 'true' || value === 'false') return true;
      throw new Error('Board sharing preference is not valid.');
    }),
];

const listRules = [
  query('search').optional().trim().isLength({ max: 80 }).withMessage('Search is too long.'),
  query('status')
    .optional()
    .isIn(STATUSES)
    .withMessage('That status filter is not valid.'),
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 24 }).withMessage('Please request between 1 and 24 items.'),
];

const boardListRules = [
  slugRule,
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('That page is not valid.'),
  query('limit').optional().isInt({ min: 1, max: 48 }).withMessage('Please request between 1 and 48 items.'),
];

const boardVoteRules = [
  slugRule,
  wantIdRule,
];

const updateRules = [
  idRule,
  body('status')
    .optional()
    .isIn(STATUSES)
    .withMessage('Please choose a valid status.'),
  body('sellerNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be 500 characters or fewer.'),
  body('boardApproved')
    .optional()
    .custom((value) => {
      if (typeof value === 'boolean') return true;
      if (value === 'true' || value === 'false') return true;
      throw new Error('Board visibility setting is not valid.');
    }),
  body('publicRequestText')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Public request text must be 500 characters or fewer.'),
  body().custom((value) => {
    if (!value || typeof value !== 'object') {
      throw new Error('Please change the status, notes, or board settings.');
    }
    const keys = ['status', 'sellerNotes', 'boardApproved', 'publicRequestText'];
    if (!keys.some((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      throw new Error('Please change the status, notes, or board settings.');
    }
    return true;
  }),
];

module.exports = {
  publicCreateRules,
  listRules,
  updateRules,
  idRule,
  slugRule,
  boardListRules,
  boardVoteRules,
  wantIdRule,
};
