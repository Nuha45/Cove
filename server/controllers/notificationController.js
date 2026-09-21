const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const list = asyncHandler(async (req, res) => {
  const notifications = await notificationService.listForSeller(
    req.businessId,
    req.user._id,
    { limit: req.query.limit }
  );
  res.json({
    notifications: notifications.map((item) => item.toPublic()),
  });
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.businessId, req.user._id);
  res.json({ count });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(
    req.businessId,
    req.user._id,
    req.params.id
  );
  res.json({ notification: notification.toPublic() });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.businessId, req.user._id);
  res.json(result);
});

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
};
