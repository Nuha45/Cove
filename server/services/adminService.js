const mongoose = require('mongoose');
const Business = require('../models/Business');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const ApiError = require('../utils/ApiError');
const { COVE_PRO } = require('../utils/covePlan');
const { ACCOUNT_STATUS_LABELS, accountStatus } = require('../utils/adminStatus');

const TRIAL_SOON_DAYS = 7;
const RECENT_SIGNUPS = 8;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 80;

const SUBSCRIPTION_FIELDS = 'businessId status trialStartAt trialEndAt currentPeriodEndAt cancelledAt cancelAtPeriodEnd providerSubscriptionId';

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundedInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function subscriptionSummary(subscription, now = new Date()) {
  const bucket = accountStatus(subscription, now);
  return {
    accountStatus: bucket,
    accountStatusLabel: ACCOUNT_STATUS_LABELS[bucket],
    billingStatus: subscription?.status || 'none',
    trialStartAt: subscription?.trialStartAt || null,
    trialEndAt: subscription?.trialEndAt || null,
    currentPeriodEndAt: subscription?.currentPeriodEndAt || null,
    cancelledAt: subscription?.cancelledAt || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
  };
}

function ownerSummary(user) {
  if (!user) return null;
  return { name: user.name, email: user.email };
}

function businessRow(business, owner, subscription, now) {
  return {
    id: business._id.toString(),
    name: business.name,
    slug: business.slug,
    category: business.category,
    createdAt: business.createdAt,
    owner: ownerSummary(owner),
    subscription: subscriptionSummary(subscription, now),
  };
}

async function loadOwnersAndSubscriptions(businesses) {
  const businessIds = businesses.map((item) => item._id);
  const ownerIds = businesses.map((item) => item.ownerId).filter(Boolean);
  const [owners, subscriptions] = await Promise.all([
    User.find({ _id: { $in: ownerIds } }).select('name email').lean(),
    Subscription.find({ businessId: { $in: businessIds } }).select(SUBSCRIPTION_FIELDS).lean(),
  ]);
  return {
    ownersById: new Map(owners.map((item) => [String(item._id), item])),
    subsByBusiness: new Map(subscriptions.map((item) => [String(item.businessId), item])),
  };
}

async function getOverview(now = new Date()) {
  const [businessIds, subscriptions] = await Promise.all([
    Business.find({}).select('_id').lean(),
    Subscription.find({}).select(SUBSCRIPTION_FIELDS).lean(),
  ]);

  const existing = new Set(businessIds.map((item) => String(item._id)));
  const subsByBusiness = new Map();
  subscriptions.forEach((item) => {
    if (existing.has(String(item.businessId))) subsByBusiness.set(String(item.businessId), item);
  });

  const counts = { active: 0, trial: 0, payment_required: 0, restricted: 0 };
  existing.forEach((id) => {
    counts[accountStatus(subsByBusiness.get(id), now)] += 1;
  });

  const soonCutoff = new Date(now.getTime() + TRIAL_SOON_DAYS * 24 * 60 * 60 * 1000);
  const endingSoon = [...subsByBusiness.values()]
    .filter((item) => item.status === 'trialing'
      && item.trialEndAt
      && new Date(item.trialEndAt) > now
      && new Date(item.trialEndAt) <= soonCutoff)
    .sort((a, b) => new Date(a.trialEndAt) - new Date(b.trialEndAt));

  const soonBusinesses = endingSoon.length
    ? await Business.find({ _id: { $in: endingSoon.slice(0, 10).map((item) => item.businessId) } })
      .select('name slug')
      .lean()
    : [];
  const soonById = new Map(soonBusinesses.map((item) => [String(item._id), item]));

  const recent = await Business.find({})
    .sort({ createdAt: -1 })
    .limit(RECENT_SIGNUPS)
    .select('name slug category createdAt ownerId')
    .lean();
  const { ownersById, subsByBusiness: recentSubs } = await loadOwnersAndSubscriptions(recent);

  return {
    totals: {
      businesses: existing.size,
      active: counts.active,
      trial: counts.trial,
      paymentRequired: counts.payment_required,
      restricted: counts.restricted,
    },
    trialsEndingSoon: {
      windowDays: TRIAL_SOON_DAYS,
      count: endingSoon.length,
      items: endingSoon.slice(0, 10).map((item) => {
        const business = soonById.get(String(item.businessId));
        return {
          id: String(item.businessId),
          name: business?.name || 'Unknown business',
          trialEndAt: item.trialEndAt,
        };
      }),
    },
    // Estimate only: active subscriptions × the server-side Cove Pro price.
    revenue: {
      plan: COVE_PRO.name,
      currency: COVE_PRO.currency,
      pricePerMonth: COVE_PRO.amountDisplay,
      activeSubscriptions: counts.active,
      estimatedMrr: counts.active * COVE_PRO.amountDisplay,
    },
    recentSignups: recent.map((business) => businessRow(
      business,
      ownersById.get(String(business.ownerId)),
      recentSubs.get(String(business._id)),
      now
    )),
  };
}

async function listBusinesses(input = {}, now = new Date()) {
  const limit = boundedInt(input.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  let page = boundedInt(input.page, 1, 1, 10000);
  const search = typeof input.search === 'string'
    ? input.search.trim().slice(0, MAX_SEARCH_LENGTH)
    : '';

  const filter = {};
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    const matchingOwners = await User.find({ $or: [{ email: pattern }, { name: pattern }] })
      .select('businessId')
      .limit(500)
      .lean();
    filter.$or = [
      { name: pattern },
      { slug: pattern },
      { _id: { $in: matchingOwners.map((item) => item.businessId) } },
    ];
  }

  const total = await Business.countDocuments(filter);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  if (totalPages > 0 && page > totalPages) page = totalPages;

  const businesses = await Business.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('name slug category createdAt ownerId')
    .lean();
  const { ownersById, subsByBusiness } = await loadOwnersAndSubscriptions(businesses);

  return {
    businesses: businesses.map((business) => businessRow(
      business,
      ownersById.get(String(business.ownerId)),
      subsByBusiness.get(String(business._id)),
      now
    )),
    total,
    page,
    limit,
    totalPages,
  };
}

function latest(candidates) {
  return candidates
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
}

async function getBusinessDetail(id, now = new Date()) {
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id) || String(new mongoose.Types.ObjectId(id)) !== id) {
    throw new ApiError(404, 'We could not find that business.');
  }

  const business = await Business.findById(id)
    .select('name slug category city storefrontActive createdAt ownerId')
    .lean();
  if (!business) throw new ApiError(404, 'We could not find that business.');

  const businessId = business._id;
  const [
    owner,
    subscription,
    products,
    activeProducts,
    orders,
    customers,
    customerWants,
    lastOrder,
    lastProduct,
    lastWant,
  ] = await Promise.all([
    User.findOne({ _id: business.ownerId, businessId }).select('name email createdAt').lean(),
    Subscription.findOne({ businessId }).select(SUBSCRIPTION_FIELDS).lean(),
    Product.countDocuments({ businessId }),
    Product.countDocuments({ businessId, status: 'Active' }),
    Order.countDocuments({ businessId }),
    Customer.countDocuments({ businessId }),
    CustomerWant.countDocuments({ businessId }),
    Order.findOne({ businessId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    Product.findOne({ businessId }).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    CustomerWant.findOne({ businessId }).sort({ createdAt: -1 }).select('createdAt').lean(),
  ]);

  const lastActivity = latest([
    { type: 'order', label: 'Order received', at: lastOrder?.createdAt },
    { type: 'product', label: 'Product updated', at: lastProduct?.updatedAt },
    { type: 'customer_request', label: 'Customer request received', at: lastWant?.createdAt },
  ]);

  return {
    id: businessId.toString(),
    name: business.name,
    slug: business.slug,
    category: business.category,
    city: business.city || '',
    storefrontActive: business.storefrontActive !== false,
    createdAt: business.createdAt,
    owner: owner ? { name: owner.name, email: owner.email, createdAt: owner.createdAt } : null,
    subscription: subscriptionSummary(subscription, now),
    lastActivity,
    counts: {
      products,
      activeProducts,
      orders,
      customers,
      customerRequests: customerWants,
    },
  };
}

module.exports = {
  getOverview,
  listBusinesses,
  getBusinessDetail,
  MAX_PAGE_SIZE,
};
