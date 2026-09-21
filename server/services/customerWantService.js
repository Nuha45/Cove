const CustomerWant = require('../models/CustomerWant');
const Customer = require('../models/Customer');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { normalizePhone, displayPhone } = require('../utils/phone');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getBusinessBySlug(slug) {
  const business = await Business.findOne({ slug: String(slug || '').toLowerCase().trim() });
  if (!business) {
    throw new ApiError(404, 'We could not find that shop.');
  }
  return business;
}

async function findMatchingCustomer(businessId, phone) {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return null;
  return Customer.findOne({ businessId, phoneNormalized }).select('_id');
}

async function createPublic(slug, input) {
  const business = await getBusinessBySlug(slug);
  const phone = displayPhone(input.phone);
  const phoneNormalized = normalizePhone(input.phone);
  const matched = await findMatchingCustomer(business._id, input.phone);

  const want = await CustomerWant.create({
    businessId: business._id,
    customerId: matched?._id || null,
    name: String(input.name || '').trim(),
    phone,
    phoneNormalized,
    email: String(input.email || '').trim().toLowerCase(),
    request: String(input.request || '').trim(),
    quantity: input.quantity === undefined || input.quantity === null || input.quantity === ''
      ? null
      : Number(input.quantity),
    notes: String(input.notes || '').trim(),
    sellerNotes: '',
    status: 'New',
  });

  setImmediate(() => {
    const notifyEvents = require('./notifyEvents');
    notifyEvents.notifyCustomerWant({
      businessId: business._id,
      wantId: want._id,
      preview: want.request,
    }).catch(() => {});
  });

  return want;
}

function buildFilter(businessId, { search, status }) {
  const filter = { businessId };
  if (status) filter.status = status;
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    const phoneKey = normalizePhone(search);
    filter.$or = [
      { request: pattern },
      { name: pattern },
      { phone: pattern },
      ...(phoneKey ? [{ phoneNormalized: phoneKey }] : []),
    ];
  }
  return filter;
}

async function list(businessId, input) {
  const limit = Number(input.limit) || 12;
  let page = Number(input.page) || 1;
  const filter = buildFilter(businessId, input);
  const total = await CustomerWant.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const wants = await CustomerWant.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    wants,
    page,
    limit,
    total,
    totalPages,
  };
}

async function getById(businessId, id) {
  const want = await CustomerWant.findOne({ _id: id, businessId });
  if (!want) {
    throw new ApiError(404, 'We could not find that request.');
  }
  return want;
}

async function update(businessId, id, input) {
  const want = await getById(businessId, id);
  if (input.status !== undefined) want.status = input.status;
  if (input.sellerNotes !== undefined) want.sellerNotes = String(input.sellerNotes || '').trim();
  await want.save();
  return want;
}

module.exports = {
  createPublic,
  list,
  getById,
  update,
};
