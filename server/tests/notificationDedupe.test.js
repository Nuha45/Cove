const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');

const businessIds = [];

function tenant() {
  const ids = { businessId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId() };
  businessIds.push(ids.businessId);
  return ids;
}

function input(ids, overrides = {}) {
  return {
    ...ids,
    type: 'NEW_ORDER',
    title: 'New order received',
    message: 'CV-0001 · Asha · ₹250',
    relatedEntityType: 'order',
    relatedEntityId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('notification dedupe index', { timeout: 120000 }, () => {
  before(async () => {
    await connectTestDB();
  });

  after(async () => {
    if (businessIds.length) await Notification.deleteMany({ businessId: { $in: businessIds } });
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('builds a unique partial index on businessId + dedupeKey without sparse', async () => {
    const index = (await Notification.collection.indexes()).find((item) => item.name === 'businessId_1_dedupeKey_1');
    assert.ok(index, 'dedupe index exists');
    assert.deepEqual(index.key, { businessId: 1, dedupeKey: 1 });
    assert.equal(index.unique, true);
    assert.equal(index.sparse, undefined);
    assert.deepEqual(index.partialFilterExpression, { dedupeKey: { $type: 'string', $gt: '' } });
  });

  it('createOnce returns the existing notification for a repeated dedupe key', async () => {
    const ids = tenant();
    const first = await notificationService.createOnce(input(ids, { dedupeKey: 'NEW_ORDER:a' }));
    const second = await notificationService.createOnce(input(ids, { dedupeKey: 'NEW_ORDER:a', title: 'Retry' }));
    assert.equal(String(second._id), String(first._id));
    assert.equal(second.title, 'New order received');
    assert.equal(await Notification.countDocuments({ businessId: ids.businessId }), 1);
  });

  it('concurrent createOnce calls with one dedupe key store a single notification', async () => {
    const ids = tenant();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => notificationService.createOnce(input(ids, { dedupeKey: 'NEW_ORDER:race' })))
    );
    assert.equal(new Set(results.map((item) => String(item._id))).size, 1);
    assert.equal(await Notification.countDocuments({ businessId: ids.businessId }), 1);
  });

  it('the database rejects a direct duplicate non-empty dedupe key', async () => {
    const ids = tenant();
    await Notification.create(input(ids, { dedupeKey: 'LOW_STOCK:p1:o1' }));
    await assert.rejects(Notification.create(input(ids, { dedupeKey: 'LOW_STOCK:p1:o1' })), (err) => err.code === 11000);
  });

  it('the same dedupe key is allowed in different shops', async () => {
    const shopA = tenant();
    const shopB = tenant();
    await notificationService.createOnce(input(shopA, { dedupeKey: 'NEW_ORDER:shared' }));
    await notificationService.createOnce(input(shopB, { dedupeKey: 'NEW_ORDER:shared' }));
    assert.equal(await Notification.countDocuments({ dedupeKey: 'NEW_ORDER:shared', businessId: { $in: [shopA.businessId, shopB.businessId] } }), 2);
  });

  it('notifications with an empty dedupe key are never deduplicated', async () => {
    const ids = tenant();
    await notificationService.createOnce(input(ids));
    await notificationService.createOnce(input(ids, { dedupeKey: '' }));
    await Promise.all([notificationService.createOnce(input(ids)), notificationService.createOnce(input(ids))]);
    assert.equal(await Notification.countDocuments({ businessId: ids.businessId, dedupeKey: '' }), 4);
  });

  it('notifications stored without a dedupeKey field do not collide', async () => {
    const ids = tenant();
    const raw = () => ({
      ...ids, type: 'NEW_ORDER', title: 't', message: 'm', isRead: false, createdAt: new Date(), updatedAt: new Date(),
    });
    await Notification.collection.insertMany([raw(), raw(), raw()]);
    assert.equal(await Notification.countDocuments({ businessId: ids.businessId, dedupeKey: { $exists: false } }), 3);
  });
});
