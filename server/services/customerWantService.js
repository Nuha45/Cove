const CustomerWant = require('../models/CustomerWant');
const CustomerWantVote = require('../models/CustomerWantVote');
const Customer = require('../models/Customer');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { normalizePhone, displayPhone } = require('../utils/phone');
const { buildVoterKeyHash } = require('../utils/wantBoardVote');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
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
  const shareOnBoardOptIn = asBoolean(input.shareOnBoardOptIn, false) === true;

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
    // Private by default. Opt-in never auto-publishes — seller must approve separately.
    shareOnBoardOptIn,
    boardApproved: false,
    publicRequestText: '',
    voteCount: 0,
    boardPublishedAt: null,
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

  if (Object.prototype.hasOwnProperty.call(input, 'publicRequestText')) {
    want.publicRequestText = String(input.publicRequestText || '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(input, 'boardApproved')) {
    const nextApproved = asBoolean(input.boardApproved, want.boardApproved) === true;
    if (nextApproved) {
      if (!want.shareOnBoardOptIn) {
        throw new ApiError(400, 'This customer did not opt in to share on the request board.', [
          {
            field: 'boardApproved',
            message: 'This customer did not opt in to share on the request board.',
          },
        ]);
      }
      if (!want.publicRequestText) {
        want.publicRequestText = want.request;
      }
      if (!want.boardPublishedAt) {
        want.boardPublishedAt = new Date();
      }
      want.boardApproved = true;
    } else {
      want.boardApproved = false;
    }
  }

  if (want.boardApproved && !String(want.publicRequestText || '').trim()) {
    want.publicRequestText = want.request;
  }

  await want.save();
  return want;
}

async function listBoard(slug, input = {}) {
  const business = await getBusinessBySlug(slug);
  const limit = Math.min(Number(input.limit) || 24, 48);
  let page = Number(input.page) || 1;

  const filter = {
    businessId: business._id,
    boardApproved: true,
    shareOnBoardOptIn: true,
  };

  const total = await CustomerWant.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const wants = await CustomerWant.find(filter)
    .sort({ voteCount: -1, boardPublishedAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('publicRequestText request voteCount status boardPublishedAt createdAt boardApproved shareOnBoardOptIn');

  return {
    business,
    wants,
    page,
    limit,
    total,
    totalPages,
  };
}

async function voteOnBoard(slug, wantId, req) {
  const business = await getBusinessBySlug(slug);
  const want = await CustomerWant.findOne({
    _id: wantId,
    businessId: business._id,
    boardApproved: true,
    shareOnBoardOptIn: true,
  });

  if (!want) {
    throw new ApiError(404, 'We could not find that request on the board.');
  }

  const voterKeyHash = buildVoterKeyHash(req, want._id.toString());

  try {
    await CustomerWantVote.create({
      businessId: business._id,
      wantId: want._id,
      voterKeyHash,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, 'You have already shown interest in this request.', [
        { field: 'vote', message: 'You have already shown interest in this request.' },
      ]);
    }
    throw err;
  }

  const updated = await CustomerWant.findOneAndUpdate(
    { _id: want._id, businessId: business._id },
    { $inc: { voteCount: 1 } },
    { new: true }
  ).select('publicRequestText request voteCount status boardPublishedAt createdAt boardApproved shareOnBoardOptIn');

  return updated;
}

module.exports = {
  createPublic,
  list,
  getById,
  update,
  listBoard,
  voteOnBoard,
};
