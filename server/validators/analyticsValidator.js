const { query } = require('express-validator');
const { RANGE_KEYS } = require('../utils/dateRange');

const rangeRules = [
  query('range')
    .optional()
    .isIn(RANGE_KEYS)
    .withMessage('Choose a valid date range.'),
  query('from')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Choose a valid start date.'),
  query('to')
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Choose a valid end date.'),
];

module.exports = { rangeRules };
