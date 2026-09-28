const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { normalizePhone, displayPhone } = require('../utils/phone');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function recordOrder(businessId, snapshot, orderTotal, orderedAt, session) {
  const name = String(snapshot.name || '').trim();
  const phone = displayPhone(snapshot.phone);
  const phoneNormalized = normalizePhone(snapshot.phone);
  const email = String(snapshot.email || '').trim().toLowerCase();
  const amount = roundMoney(orderTotal);
  const when = orderedAt || new Date();

  if (phoneNormalized) {
    const customer = await Customer.findOneAndUpdate(
      { businessId, phoneNormalized },
      {
        $set: {
          name,
          phone,
          ...(email ? { email } : {}),
          lastOrderAt: when,
        },
        $inc: {
          totalOrders: 1,
          totalSpent: amount,
        },
        $setOnInsert: {
          businessId,
          phoneNormalized,
          notes: '',
          ...(email ? {} : { email: '' }),
        },
      },
      { upsert: true, new: true, session }
    );
    return customer;
  }

  if (email) {
    const existing = await Customer.findOne({
      businessId,
      email,
      phoneNormalized: '',
    }).session(session);

    if (existing) {
      existing.name = name;
      existing.email = email;
      existing.totalOrders += 1;
      existing.totalSpent = roundMoney(existing.totalSpent + amount);
      existing.lastOrderAt = when;
      await existing.save({ session });
      return existing;
    }
  }

  // No confident match. Create a separate record rather than merging strangers.
  const [created] = await Customer.create([{
    businessId,
    name,
    phone,
    phoneNormalized: '',
    email,
    notes: '',
    totalOrders: 1,
    totalSpent: amount,
    lastOrderAt: when,
  }], { session });
  return created;
}

async function reverseOrder(businessId, customerId, orderTotal, cancelledOrderId, session) {
  if (!customerId) return null;

  const amount = roundMoney(orderTotal);
  const customer = await Customer.findOne({ _id: customerId, businessId }).session(session);
  if (!customer) return null;

  customer.totalOrders = Math.max(0, customer.totalOrders - 1);
  customer.totalSpent = Math.max(0, roundMoney(customer.totalSpent - amount));

  const latest = await Order.findOne({
    businessId,
    customerId,
    status: { $ne: 'Cancelled' },
    _id: { $ne: cancelledOrderId },
  })
    .sort({ createdAt: -1, _id: -1 })
    .session(session)
    .select('createdAt');

  customer.lastOrderAt = latest?.createdAt || null;
  await customer.save({ session });
  return customer;
}

// Same split as the Analytics customer insights: new = at most one order, returning = two or more.
const CUSTOMER_TYPE_FILTERS = {
  new: { totalOrders: { $lte: 1 } },
  returning: { totalOrders: { $gte: 2 } },
};

function buildFilter(businessId, { search, type }) {
  const filter = { businessId, ...(CUSTOMER_TYPE_FILTERS[type] || {}) };
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    const phoneKey = normalizePhone(search);
    filter.$or = [
      { name: pattern },
      { phone: pattern },
      { email: pattern },
      ...(phoneKey ? [{ phoneNormalized: phoneKey }] : []),
    ];
  }
  return filter;
}

async function list(businessId, input) {
  const limit = Number(input.limit) || 12;
  let page = Number(input.page) || 1;
  const filter = buildFilter(businessId, input);
  const total = await Customer.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const customers = await Customer.find(filter)
    .sort({ lastOrderAt: -1, createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    customers,
    page,
    limit,
    total,
    totalPages,
  };
}

async function getById(businessId, id) {
  const customer = await Customer.findOne({ _id: id, businessId });
  if (!customer) {
    throw new ApiError(404, 'We could not find that customer.');
  }
  return customer;
}

async function update(businessId, id, input) {
  const customer = await getById(businessId, id);
  if (input.name !== undefined) customer.name = input.name;
  if (input.phone !== undefined) {
    customer.phone = displayPhone(input.phone);
    customer.phoneNormalized = normalizePhone(input.phone);
  }
  if (input.email !== undefined) customer.email = String(input.email || '').trim().toLowerCase();
  if (input.notes !== undefined) customer.notes = String(input.notes || '').trim();

  try {
    await customer.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'Another customer already uses that phone number.');
    }
    throw err;
  }
  return customer;
}

async function listOrders(businessId, customerId, input) {
  await getById(businessId, customerId);
  const limit = Number(input.limit) || 12;
  let page = Number(input.page) || 1;
  const filter = { businessId, customerId };
  const total = await Order.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const orders = await Order.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('orderNumber status paymentStatus total createdAt deliveryMethod');

  return {
    orders,
    page,
    limit,
    total,
    totalPages,
  };
}

module.exports = {
  recordOrder,
  reverseOrder,
  list,
  getById,
  update,
  listOrders,
  normalizePhone,
};
