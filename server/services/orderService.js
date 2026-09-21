const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const {
  canTransition,
  transitionMessage,
  canSellerSetPayment,
  paymentTransitionMessage,
} = require('../utils/orderStatus');
const {
  normalizePaymentMethod,
} = require('../utils/paymentMethods');
const customerService = require('./customerService');

const OPEN_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready'];

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emptySummary() {
  return {
    total: 0,
    new: 0,
    pendingPayment: 0,
    pendingPaymentTotal: 0,
    todayPaidTotal: 0,
  };
}

let readyPromise;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = Promise.all([Order.init(), OrderCounter.init(), Customer.init()]).catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function nextOrderNumber(businessId, session) {
  const counter = await OrderCounter.findOneAndUpdate(
    { businessId },
    { $inc: { seq: 1 } },
    { new: true, session }
  );
  if (!counter) {
    throw new ApiError(500, 'Could not assign an order number.');
  }
  return `COVE-${String(counter.seq).padStart(6, '0')}`;
}

async function claimItems(businessId, requested, session) {
  const snapshots = [];

  for (const item of requested) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError(400, 'Quantity must be at least 1.');
    }

    // Claim the unit and read the price from that same document.
    // A later product edit cannot change what this order charged.
    const claimed = await Product.findOneAndUpdate(
      {
        _id: item.productId,
        businessId,
        status: 'Active',
        stockQuantity: { $gte: quantity },
      },
      { $inc: { stockQuantity: -quantity } },
      { session, new: false }
    );

    if (!claimed) {
      const existing = await Product.findOne({ _id: item.productId, businessId }).session(session);
      if (!existing) {
        throw new ApiError(400, 'One of those products is not in your catalog.');
      }
      if (existing.status !== 'Active') {
        throw new ApiError(400, `${existing.name} is not available to order.`);
      }
      throw new ApiError(409, `Not enough stock for ${existing.name}.`);
    }

    const price = roundMoney(claimed.price);
    snapshots.push({
      productId: claimed._id,
      name: claimed.name,
      price,
      quantity,
      subtotal: roundMoney(price * quantity),
    });
  }

  return snapshots;
}

async function create(businessId, input) {
  await ensureReady();
  const requested = (input.items || []).map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
  }));
  const seen = new Set();
  requested.forEach((item) => {
    const key = String(item.productId);
    if (seen.has(key)) {
      throw new ApiError(400, 'Each product can only appear once. Increase the quantity instead.');
    }
    seen.add(key);
  });

  // Create the counter row outside the transaction so the first order can still increment it.
  await OrderCounter.updateOne(
    { businessId },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );

  const session = await mongoose.startSession();
  try {
    // Atlas runs as a replica set, so stock, customer stats, and the order commit together.
    const order = await session.withTransaction(async () => {
      const business = await Business.findById(businessId).session(session);
      if (!business) {
        throw new ApiError(404, 'Business not found.');
      }
      const items = await claimItems(businessId, requested, session);
      const subtotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
      // Always use the saved business delivery fee. Never trust a client-supplied amount.
      const deliveryFee = input.deliveryMethod === 'Delivery'
        ? roundMoney(business.deliveryFee || 0)
        : 0;
      const total = roundMoney(subtotal + deliveryFee);
      const orderNumber = await nextOrderNumber(businessId, session);
      const customerSnapshot = {
        name: input.customer.name,
        phone: input.customer.phone || '',
        email: input.customer.email || '',
      };

      // Ignore any client-supplied customerId. Resolve from checkout identity only.
      const customer = await customerService.recordOrder(
        businessId,
        customerSnapshot,
        total,
        new Date(),
        session
      );

      const orderDoc = {
        businessId,
        orderNumber,
        customerId: customer._id,
        customer: customerSnapshot,
        items,
        subtotal,
        deliveryFee,
        total,
        paymentStatus: 'Payment Pending',
        paymentMethod: normalizePaymentMethod(input.paymentMethod) || '',
        paymentEvents: [{
          at: new Date(),
          fromStatus: 'Payment Pending',
          toStatus: 'Payment Pending',
          actorType: 'system',
          note: 'Order created',
        }],
        status: 'New',
        deliveryMethod: input.deliveryMethod,
        deliveryAddress: input.deliveryMethod === 'Delivery' ? String(input.deliveryAddress || '').trim() : '',
        notes: input.notes || '',
        stockRestored: false,
      };
      // Public storefront checkouts may attach a hashed confirmation token. Seller orders omit it.
      if (input.confirmationTokenHash) {
        orderDoc.confirmationTokenHash = input.confirmationTokenHash;
      }

      const [created] = await Order.create([orderDoc], { session });
      return created;
    });

    // Seller-created and storefront orders both land here. Storefront also notifies from storeService.
    if (!input.confirmationTokenHash) {
      setImmediate(() => {
        const notifyEvents = require('./notifyEvents');
        notifyEvents.notifyNewOrder({ businessId, order }).catch(() => {});
      });
    }

    return order;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.code === 11000) {
      throw new ApiError(409, 'Could not save that order. Please try again.');
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

function buildFilter(businessId, { search, status, paymentStatus }) {
  const filter = { businessId };
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { orderNumber: pattern },
      { 'customer.name': pattern },
      { 'customer.phone': pattern },
    ];
  }
  return filter;
}

async function summarize(businessId) {
  const start = startOfToday();
  const [counts] = await Order.aggregate([
    { $match: { businessId: new mongoose.Types.ObjectId(String(businessId)) } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        new: { $sum: { $cond: [{ $eq: ['$status', 'New'] }, 1, 0] } },
        pendingPayment: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$paymentStatus', ['Pending', 'Payment Pending', 'Payment Submitted']] },
                  { $ne: ['$status', 'Cancelled'] },
                ],
              },
              1,
              0,
            ],
          },
        },
        pendingPaymentTotal: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $in: ['$paymentStatus', ['Pending', 'Payment Pending', 'Payment Submitted']] },
                  { $ne: ['$status', 'Cancelled'] },
                ],
              },
              '$total',
              0,
            ],
          },
        },
        todayPaidTotal: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$paymentStatus', 'Paid'] },
                  { $ne: ['$status', 'Cancelled'] },
                  { $gte: ['$createdAt', start] },
                ],
              },
              '$total',
              0,
            ],
          },
        },
      },
    },
  ]);

  if (!counts) return emptySummary();
  return {
    total: counts.total,
    new: counts.new,
    pendingPayment: counts.pendingPayment,
    pendingPaymentTotal: roundMoney(counts.pendingPaymentTotal),
    todayPaidTotal: roundMoney(counts.todayPaidTotal),
  };
}

async function list(businessId, input) {
  const limit = Number(input.limit) || 12;
  let page = Number(input.page) || 1;
  const filter = buildFilter(businessId, input);
  const total = await Order.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const orders = await Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    orders,
    page,
    limit,
    total,
    totalPages,
    summary: await summarize(businessId),
  };
}

async function getById(businessId, id) {
  const order = await Order.findOne({ _id: id, businessId });
  if (!order) {
    throw new ApiError(404, 'We could not find that order.');
  }
  return order;
}

async function restoreStock(items, businessId, session) {
  for (const item of items) {
    const result = await Product.updateOne(
      { _id: item.productId, businessId },
      { $inc: { stockQuantity: item.quantity } },
      { session }
    );
    if (result.matchedCount !== 1) {
      throw new ApiError(409, 'We could not restore stock for this order. Nothing was changed.');
    }
  }
}

async function cancel(businessId, id, paymentStatus, actorUserId = null) {
  await ensureReady();
  const session = await mongoose.startSession();
  try {
    const order = await session.withTransaction(async () => {
      const previous = await Order.findOneAndUpdate(
        {
          _id: id,
          businessId,
          stockRestored: { $ne: true },
          status: { $in: OPEN_STATUSES },
        },
        {
          $set: {
            status: 'Cancelled',
            stockRestored: true,
          },
        },
        { session, new: false }
      );

      if (!previous) {
        const existing = await Order.findOne({ _id: id, businessId }).session(session);
        if (!existing) throw new ApiError(404, 'We could not find that order.');
        if (existing.status === 'Cancelled' || existing.stockRestored) {
          throw new ApiError(409, 'This order is already cancelled.');
        }
        throw new ApiError(400, transitionMessage(existing.status));
      }

      await restoreStock(previous.items, businessId, session);
      // Cancelled orders do not count as revenue. Reverse the create-time stats once.
      await customerService.reverseOrder(
        businessId,
        previous.customerId,
        previous.total,
        previous._id,
        session
      );

      const current = await Order.findOne({ _id: id, businessId }).session(session);
      if (paymentStatus && paymentStatus !== current.paymentStatus) {
        applySellerPaymentChange(current, paymentStatus, actorUserId, '');
        await current.save({ session });
      }
      return current;
    });
    return order;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  } finally {
    await session.endSession();
  }
}

async function update(businessId, id, input, actorUserId = null) {
  const hasStatus = input.status !== undefined;
  const hasPayment = input.paymentStatus !== undefined;
  if (!hasStatus && !hasPayment) {
    throw new ApiError(400, 'Please change the order status or payment status.');
  }
  if (hasStatus && input.status === 'Cancelled') {
    return cancel(businessId, id, hasPayment ? input.paymentStatus : undefined, actorUserId);
  }

  let previousStatus = null;
  let previousPayment = null;
  const session = await mongoose.startSession();
  try {
    const order = await session.withTransaction(async () => {
      const current = await Order.findOne({ _id: id, businessId }).session(session);
      if (!current) throw new ApiError(404, 'We could not find that order.');
      previousStatus = current.status;
      previousPayment = current.paymentStatus;

      if (hasStatus && input.status !== current.status) {
        if (!canTransition(current.status, input.status)) {
          throw new ApiError(400, transitionMessage(current.status));
        }
        current.status = input.status;
      }
      if (hasPayment && input.paymentStatus !== current.paymentStatus) {
        applySellerPaymentChange(current, input.paymentStatus, actorUserId, input.paymentRejectionNote);
      }
      await current.save({ session });
      return current;
    });

    setImmediate(() => {
      const notifyEvents = require('./notifyEvents');
      if (hasStatus && previousStatus && previousStatus !== order.status) {
        notifyEvents.notifyOrderStatusChanged({
          businessId,
          order,
          previousStatus,
        }).catch(() => {});
      }
      if (hasPayment && previousPayment !== 'Paid' && order.paymentStatus === 'Paid') {
        notifyEvents.notifyPaymentVerified({ businessId, order }).catch(() => {});
      }
    });

    return order;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw err;
  } finally {
    await session.endSession();
  }
}

function applySellerPaymentChange(order, nextStatus, actorUserId, rejectionNote) {
  if (!canSellerSetPayment(order.paymentStatus, nextStatus)) {
    throw new ApiError(400, paymentTransitionMessage(order.paymentStatus), [
      { field: 'paymentStatus', message: paymentTransitionMessage(order.paymentStatus) },
    ]);
  }

  const fromStatus = order.paymentStatus;
  order.paymentStatus = nextStatus;
  order.paymentEvents = order.paymentEvents || [];
  order.paymentEvents.push({
    at: new Date(),
    fromStatus,
    toStatus: nextStatus,
    actorType: 'seller',
    actorUserId: actorUserId || null,
    note: nextStatus === 'Payment Rejected'
      ? String(rejectionNote || '').trim().slice(0, 300)
      : '',
  });

  if (nextStatus === 'Paid') {
    order.paymentVerifiedAt = new Date();
    order.paymentVerifiedBy = actorUserId || null;
    order.paymentRejectionNote = '';
  } else if (nextStatus === 'Payment Rejected') {
    order.paymentVerifiedAt = null;
    order.paymentVerifiedBy = actorUserId || null;
    order.paymentRejectionNote = String(rejectionNote || '').trim().slice(0, 300);
  } else if (nextStatus === 'Payment Pending') {
    order.paymentVerifiedAt = null;
    order.paymentVerifiedBy = null;
    order.paymentRejectionNote = '';
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
};
