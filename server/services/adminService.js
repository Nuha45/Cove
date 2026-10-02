const mongoose = require('mongoose');
const Business = require('../models/Business');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const CustomerWant = require('../models/CustomerWant');
const CustomerWantVote = require('../models/CustomerWantVote');
const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const StoreEvent = require('../models/StoreEvent');
const EmailDelivery = require('../models/EmailDelivery');
const OrderCounter = require('../models/OrderCounter');
const ApiError = require('../utils/ApiError');
const imageStorage = require('./imageStorage');
const { COVE_PRO, PLANS, PLAN_KEYS } = require('../utils/covePlan');
const { ACCOUNT_STATUS_LABELS, accountStatus } = require('../utils/adminStatus');

const TRIAL_SOON_DAYS = 7;
const RECENT_SIGNUPS = 8;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 80;

const SUBSCRIPTION_FIELDS = 'businessId status plan trialStartAt trialEndAt currentPeriodEndAt cancelledAt cancelAtPeriodEnd providerSubscriptionId lastProviderStatus';

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
    // Only a real Razorpay subscription has a chosen plan; trials and lapsed shops show none.
    planName: subscription?.providerSubscriptionId && PLANS[subscription.plan || 'pro']
      ? PLANS[subscription.plan || 'pro'].name
      : null,
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
    archivedAt: business.archivedAt || null,
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
    Business.find({ archivedAt: null }).select('_id').lean(),
    Subscription.find({}).select(SUBSCRIPTION_FIELDS).lean(),
  ]);

  const existing = new Set(businessIds.map((item) => String(item._id)));
  const subsByBusiness = new Map();
  subscriptions.forEach((item) => {
    if (existing.has(String(item.businessId))) subsByBusiness.set(String(item.businessId), item);
  });

  const counts = { active: 0, trial: 0, payment_required: 0, restricted: 0 };
  const activeByPlan = { pro: 0, advanced: 0 };
  existing.forEach((id) => {
    const subscription = subsByBusiness.get(id);
    const bucket = accountStatus(subscription, now);
    counts[bucket] += 1;
    if (bucket === 'active') activeByPlan[subscription?.plan === 'advanced' ? 'advanced' : 'pro'] += 1;
  });
  const planRevenue = PLAN_KEYS.map((key) => ({
    key,
    name: PLANS[key].name,
    pricePerMonth: PLANS[key].amountDisplay,
    activeSubscriptions: activeByPlan[key] || 0,
  }));

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

  const recent = await Business.find({ archivedAt: null })
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
    // Estimate only: active subscriptions per plan × the server-side plan price.
    revenue: {
      currency: COVE_PRO.currency,
      activeSubscriptions: counts.active,
      estimatedMrr: planRevenue.reduce((sum, item) => sum + item.activeSubscriptions * item.pricePerMonth, 0),
      plans: planRevenue,
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
    .select('name slug category createdAt archivedAt ownerId')
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

function parseBusinessId(id) {
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id) || String(new mongoose.Types.ObjectId(id)) !== id) {
    throw new ApiError(404, 'We could not find that business.');
  }
  return id;
}

async function getBusinessDetail(id, now = new Date(), viewer = null) {
  const business = await Business.findById(parseBusinessId(id))
    .select('name slug category city storefrontActive archivedAt createdAt ownerId')
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
    User.findOne({ _id: business.ownerId, businessId }).select('name email createdAt isPlatformAdmin').lean(),
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
    archivedAt: business.archivedAt || null,
    createdAt: business.createdAt,
    owner: owner
      ? {
        name: owner.name,
        email: owner.email,
        createdAt: owner.createdAt,
        isPlatformAdmin: owner.isPlatformAdmin === true,
        isYou: Boolean(viewer && String(viewer._id) === String(owner._id)),
      }
      : null,
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

async function findBusinessForAction(id, admin) {
  const business = await Business.findById(parseBusinessId(id));
  if (!business) throw new ApiError(404, 'We could not find that business.');
  if (admin && String(admin.businessId) === String(business._id)) {
    throw new ApiError(400, 'You cannot archive or delete your own shop from the admin panel.');
  }
  const adminMember = await User.exists({ businessId: business._id, isPlatformAdmin: true });
  if (adminMember) {
    throw new ApiError(400, 'This shop belongs to a platform admin and cannot be archived or deleted here.');
  }
  return business;
}

async function archiveBusiness(id, admin, now = new Date()) {
  const business = await findBusinessForAction(id, admin);
  if (!business.archivedAt) {
    business.archivedAt = now;
    await business.save();
    // Sign the owner out everywhere; login is refused while the shop is archived.
    await User.updateMany({ businessId: business._id }, { $inc: { tokenVersion: 1 } });
  }
  return getBusinessDetail(business._id.toString(), now, admin);
}

async function restoreBusiness(id, admin, now = new Date()) {
  const business = await findBusinessForAction(id, admin);
  if (business.archivedAt) {
    business.archivedAt = null;
    await business.save();
  }
  return getBusinessDetail(business._id.toString(), now, admin);
}

// Permanent. Only allowed once the shop is archived and the admin retypes the shop link.
async function deleteBusiness(id, admin, { confirmSlug } = {}) {
  const business = await findBusinessForAction(id, admin);
  if (!business.archivedAt) {
    throw new ApiError(400, 'Archive this shop before deleting it permanently.');
  }
  // Compared with the slug stored now, so a confirmation typed against stale admin data fails.
  if (typeof confirmSlug !== 'string' || confirmSlug.trim() !== business.slug) {
    throw new ApiError(400, 'Type the shop link exactly to confirm deletion.', [
      { field: 'confirmSlug', message: `Type "${business.slug}" to confirm.` },
    ]);
  }

  const businessId = business._id;
  const subscription = await Subscription.findOne({ businessId }).select('status providerSubscriptionId').lean();
  if (subscription?.providerSubscriptionId && subscription.status !== 'cancelled') {
    throw new ApiError(409, 'This shop still has a Razorpay subscription. Cancel it in Razorpay before deleting the shop.');
  }

  const scoped = { businessId };
  const results = await Promise.all([
    Product.deleteMany(scoped),
    Order.deleteMany(scoped),
    Customer.deleteMany(scoped),
    CustomerWant.deleteMany(scoped),
    CustomerWantVote.deleteMany(scoped),
    Invoice.deleteMany(scoped),
    Notification.deleteMany(scoped),
    StoreEvent.deleteMany(scoped),
    EmailDelivery.deleteMany(scoped),
    OrderCounter.deleteMany(scoped),
    Subscription.deleteMany(scoped),
    User.deleteMany(scoped),
  ]);
  await Business.deleteOne({ _id: businessId });
  await imageStorage.deleteBusinessImages(businessId);

  const [products, orders, customers] = results;
  return {
    id: businessId.toString(),
    name: business.name,
    deleted: {
      products: products.deletedCount,
      orders: orders.deletedCount,
      customers: customers.deletedCount,
    },
  };
}

// Grants or revokes platform admin for a shop's owner. The caller is already a database-checked
// admin (requireAdmin); the owner's email must be retyped so a stale page cannot change the wrong
// account. Admins cannot change their own flag, so there is always at least one admin left.
async function setOwnerPlatformAdmin(id, admin, { grant, confirmEmail } = {}, now = new Date()) {
  if (typeof grant !== 'boolean') {
    throw new ApiError(400, 'Choose whether to grant or remove admin access.');
  }
  const business = await Business.findById(parseBusinessId(id)).select('ownerId archivedAt').lean();
  if (!business) throw new ApiError(404, 'We could not find that business.');
  const owner = await User.findOne({ _id: business.ownerId, businessId: business._id })
    .select('email emailVerified isPlatformAdmin')
    .lean();
  if (!owner) throw new ApiError(404, 'This shop has no owner account.');
  if (String(owner._id) === String(admin._id)) {
    throw new ApiError(400, 'You cannot change your own admin access.');
  }
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== owner.email) {
    throw new ApiError(400, "Type the owner's email exactly to confirm.", [
      { field: 'confirmEmail', message: "Type the owner's email exactly to confirm." },
    ]);
  }
  if (grant && business.archivedAt) {
    throw new ApiError(400, 'Restore this shop before granting admin access.');
  }
  if (grant && owner.emailVerified === false) {
    throw new ApiError(400, 'The owner must verify their email before they can become an admin.');
  }
  if (owner.isPlatformAdmin !== grant) {
    await User.updateOne({ _id: owner._id }, { $set: { isPlatformAdmin: grant } });
  }
  return getBusinessDetail(String(business._id), now, admin);
}

module.exports = {
  getOverview,
  listBusinesses,
  getBusinessDetail,
  archiveBusiness,
  restoreBusiness,
  deleteBusiness,
  setOwnerPlatformAdmin,
  MAX_PAGE_SIZE,
};
