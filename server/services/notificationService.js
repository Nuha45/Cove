const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');

async function createOnce(input) {
  const dedupeKey = input.dedupeKey || '';
  if (dedupeKey) {
    const existing = await Notification.findOne({
      businessId: input.businessId,
      dedupeKey,
    });
    if (existing) return existing;
  }

  try {
    const [created] = await Notification.create([{
      userId: input.userId,
      businessId: input.businessId,
      type: input.type,
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType || '',
      relatedEntityId: input.relatedEntityId || null,
      dedupeKey,
      isRead: false,
    }]);
    return created;
  } catch (err) {
    if (err.code === 11000 && dedupeKey) {
      return Notification.findOne({ businessId: input.businessId, dedupeKey });
    }
    throw err;
  }
}

async function listForSeller(businessId, userId, { limit = 30 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 30));
  const notifications = await Notification.find({ businessId, userId })
    .sort({ createdAt: -1 })
    .limit(safeLimit);
  return notifications;
}

async function unreadCount(businessId, userId) {
  return Notification.countDocuments({ businessId, userId, isRead: false });
}

async function markRead(businessId, userId, id) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, businessId, userId },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!notification) {
    throw new ApiError(404, 'We could not find that notification.');
  }
  return notification;
}

async function markAllRead(businessId, userId) {
  await Notification.updateMany(
    { businessId, userId, isRead: false },
    { $set: { isRead: true } }
  );
  return { message: 'All notifications marked as read.' };
}

module.exports = {
  createOnce,
  listForSeller,
  unreadCount,
  markRead,
  markAllRead,
};
