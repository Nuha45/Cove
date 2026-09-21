const express = require('express');
const { param, query } = require('express-validator');
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

router.use(protect);

router.get(
  '/',
  query('limit').optional().isInt({ min: 1, max: 50 }),
  validate,
  notificationController.list
);

router.get('/unread-count', notificationController.unreadCount);

router.patch(
  '/read-all',
  writeLimiter,
  notificationController.markAllRead
);

router.patch(
  '/:id/read',
  writeLimiter,
  param('id').custom(isObjectId).withMessage('That notification is not valid.'),
  validate,
  notificationController.markRead
);

module.exports = router;
