const mongoose = require('mongoose');
const env = require('../config/env');
const Business = require('../models/Business');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const SubscriptionReceipt = require('../models/SubscriptionReceipt');
const AdminAction = require('../models/AdminAction');
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
const { billingExemptBusinessIds, releaseUnfinishedCheckout } = require('./billingService');
const { COVE_PRO, PLANS, PLAN_KEYS } = require('../utils/covePlan');
const {
  ACCOUNT_STATUSES,
  ACCOUNT_STATUS_LABELS,
  STORE_STATE_LABELS,
  accountStatus,
  trialPaymentMethod,
  isLiveProviderSubscription,
  isUnfinishedCheckout,
  storeState,
  onlinePaymentReady,
  setupStatus,
} = require('../utils/adminStatus');

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_SOON_DAYS = 7;
const RECENT_SIGNUPS = 8;
const RECENT_ADMIN_ACTIONS = 10;
const BUSINESS_HISTORY_LIMIT = 20;
const BUSINESS_RECEIPTS_LIMIT = 12;
const COLLECTED_WINDOW_DAYS = 30;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 80;

const SUBSCRIPTION_FIELDS = 'businessId status plan trialStartAt trialEndAt currentPeriodStartAt currentPeriodEndAt '
  + 'cancelledAt cancelAtPeriodEnd providerSubscriptionId lastProviderStatus pastDueSince';
const PAYMENT_SETUP_FIELDS = 'paymentQrEnabled paymentUpiId paymentQrImage paymentLinkEnabled paymentLink '
  + 'paymentInstructionsEnabled paymentInstructions';
const BUSINESS_FIELDS = `name slug category createdAt archivedAt ownerId storefrontActive ${PAYMENT_SETUP_FIELDS}`;

// Status filters shown on the Businesses page. Every filter except "all" and "archived" covers live shops only.
const LIST_FILTERS = [
  'all',
  'needs_setup',
  'email_unverified',
  'trial_no_autopay',
  'trial_ended',
  'past_due',
  'halted',
  'cancelling',
  'cancelled',
  'active',
  'exempt',
  'archived',
];

const ADMIN_ACTION_LABELS = {
  archive: 'Archived shop',
  restore: 'Restored shop',
  delete: 'Deleted seller account',
  grant_admin: 'Granted admin access',
  revoke_admin: 'Removed admin access',
};

const LIVE_SUBSCRIPTION_ARCHIVE_MESSAGE = 'This shop still has a Razorpay subscription that can charge the seller. '
  + 'Archiving would lock them out before they could cancel it. Cancel the subscription in Razorpay first, '
  + 'then archive once this page shows it as cancelled.';

function formatDay(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// Cancelling at period end will not charge again, but the seller has paid for the time until then.
function archiveRefusal(subscription) {
  if (subscription.status === 'active' && subscription.cancelAtPeriodEnd) {
    const until = subscription.currentPeriodEndAt ? ` until ${formatDay(subscription.currentPeriodEndAt)}` : '';
    return `This shop has paid${until} and its plan is set to cancel then, so Razorpay will not charge again. `
      + 'Archiving now would lock the seller out of time they paid for. Archive once this page shows the plan as '
      + 'cancelled, or cancel it immediately in Razorpay if you mean to end it now.';
  }
  return LIVE_SUBSCRIPTION_ARCHIVE_MESSAGE;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boundedInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function latest(candidates) {
  return candidates
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
}

function subscriptionSummary(subscription, now = new Date(), { exempt = false } = {}) {
  const bucket = accountStatus(subscription, now, { exempt });
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
    trialPaymentMethod: bucket === 'trial' ? trialPaymentMethod(subscription) : null,
    currentPeriodEndAt: subscription?.currentPeriodEndAt || null,
    pastDueSince: subscription?.pastDueSince || null,
    cancelledAt: subscription?.cancelledAt || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    liveProviderSubscription: isLiveProviderSubscription(subscription),
    unfinishedCheckout: isUnfinishedCheckout(subscription),
    billingExempt: exempt,
  };
}

// Owners, billing rows, admin-exempt shops and unverified accounts for a set of shops, in four queries.
async function loadContext(businesses) {
  const businessIds = businesses.map((item) => item._id);
  const ownerIds = businesses.map((item) => item.ownerId).filter(Boolean);
  if (!businessIds.length) {
    return { ownersById: new Map(), subsByBusiness: new Map(), exempt: new Set(), unverified: new Set() };
  }
  const [owners, subscriptions, exempt, unverified] = await Promise.all([
    User.find({ _id: { $in: ownerIds } }).select('name email emailVerified').lean(),
    Subscription.find({ businessId: { $in: businessIds } }).select(SUBSCRIPTION_FIELDS).lean(),
    billingExemptBusinessIds(businessIds),
    User.distinct('businessId', { businessId: { $in: businessIds }, emailVerified: false }),
  ]);
  return {
    ownersById: new Map(owners.map((item) => [String(item._id), item])),
    subsByBusiness: new Map(subscriptions.map((item) => [String(item.businessId), item])),
    exempt,
    unverified: new Set(unverified.map(String)),
  };
}

function statusFor(business, context, now) {
  const id = String(business._id);
  const subscription = context.subsByBusiness.get(id) || null;
  const exempt = context.exempt.has(id);
  const state = storeState({
    archived: Boolean(business.archivedAt),
    ownerUnverified: context.unverified.has(id),
    exempt,
    storefrontActive: business.storefrontActive,
    subscription,
    enforceBilling: env.enforceBilling,
    now,
  });
  return {
    subscription: subscriptionSummary(subscription, now, { exempt }),
    store: { state, label: STORE_STATE_LABELS[state] },
  };
}

function ownerSummary(user) {
  if (!user) return null;
  return { name: user.name, email: user.email, emailVerified: user.emailVerified !== false };
}

async function productStats(businessIds) {
  if (!businessIds.length) return new Map();
  const rows = await Product.aggregate([
    { $match: { businessId: { $in: businessIds } } },
    {
      $group: {
        _id: '$businessId',
        products: { $sum: 1 },
        activeProducts: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
        lastProductAddedAt: { $max: '$createdAt' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

// Storefront checkouts carry a confirmation token hash; orders the seller records themselves do not.
async function orderStats(businessIds) {
  if (!businessIds.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { businessId: { $in: businessIds } } },
    {
      $project: {
        businessId: 1,
        createdAt: 1,
        storefront: { $gt: [{ $ifNull: ['$confirmationTokenHash', ''] }, ''] },
        sellerPaymentAt: {
          $max: {
            $map: {
              input: {
                $filter: {
                  input: { $ifNull: ['$paymentEvents', []] },
                  as: 'event',
                  cond: { $eq: ['$$event.actorType', 'seller'] },
                },
              },
              as: 'event',
              in: '$$event.at',
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$businessId',
        orders: { $sum: 1 },
        storefrontOrders: { $sum: { $cond: ['$storefront', 1, 0] } },
        firstStorefrontOrderAt: { $min: { $cond: ['$storefront', '$createdAt', null] } },
        lastSellerOrderAt: { $max: { $cond: ['$storefront', null, '$createdAt'] } },
        lastSellerPaymentAt: { $max: '$sellerPaymentAt' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
}

// Only actions a seller takes themselves. Customer orders and stock changes from checkouts do not count.
function lastSellerActivity(products, orders) {
  return latest([
    { type: 'product', label: 'Added a product', at: products?.lastProductAddedAt },
    { type: 'order', label: 'Recorded an order', at: orders?.lastSellerOrderAt },
    { type: 'payment', label: 'Updated an order payment', at: orders?.lastSellerPaymentAt },
  ]);
}

function setupFor(business, owner, products) {
  return setupStatus({
    emailVerified: owner ? owner.emailVerified !== false : false,
    activeProducts: products?.activeProducts || 0,
    paymentsReady: onlinePaymentReady(business),
  });
}

async function businessRows(businesses, now) {
  const businessIds = businesses.map((item) => item._id);
  const [context, products, orders] = await Promise.all([
    loadContext(businesses),
    productStats(businessIds),
    orderStats(businessIds),
  ]);
  return businesses.map((business) => {
    const id = String(business._id);
    const owner = context.ownersById.get(String(business.ownerId));
    const productRow = products.get(id);
    const orderRow = orders.get(id);
    return {
      id,
      name: business.name,
      slug: business.slug,
      category: business.category,
      createdAt: business.createdAt,
      archivedAt: business.archivedAt || null,
      owner: ownerSummary(owner),
      ...statusFor(business, context, now),
      setup: setupFor(business, owner, productRow),
      counts: {
        products: productRow?.products || 0,
        activeProducts: productRow?.activeProducts || 0,
        orders: orderRow?.orders || 0,
        storefrontOrders: orderRow?.storefrontOrders || 0,
      },
      firstStorefrontOrderAt: orderRow?.firstStorefrontOrderAt || null,
      lastSellerActivity: lastSellerActivity(productRow, orderRow),
    };
  });
}

function receiptPublic(receipt) {
  return {
    id: String(receipt._id),
    receiptNumber: receipt.receiptNumber,
    planName: PLANS[receipt.plan]?.name || receipt.plan,
    amountPaise: receipt.amountPaise,
    currency: receipt.currency,
    paidAt: receipt.paidAt,
    periodStartAt: receipt.periodStartAt || null,
    periodEndAt: receipt.periodEndAt || null,
  };
}

function adminActionPublic(entry, { businessExists = true } = {}) {
  return {
    id: String(entry._id),
    action: entry.action,
    label: ADMIN_ACTION_LABELS[entry.action] || entry.action,
    adminEmail: entry.adminEmail || '',
    businessId: String(entry.businessId),
    businessName: entry.businessName || '',
    businessSlug: entry.businessSlug || '',
    businessExists,
    targetEmail: entry.targetEmail || '',
    summary: entry.summary || '',
    at: entry.createdAt,
  };
}

// Money Razorpay reported as captured, per currency. Receipts exist only for payments Cove recorded
// (webhooks since receipts were introduced, plus anything the receipt backfill script added).
async function collectedPayments(now) {
  const since = new Date(now.getTime() - COLLECTED_WINDOW_DAYS * DAY_MS);
  const rows = await SubscriptionReceipt.aggregate([
    {
      $group: {
        _id: '$currency',
        totalPaise: { $sum: '$amountPaise' },
        payments: { $sum: 1 },
        windowPaise: { $sum: { $cond: [{ $gte: ['$paidAt', since] }, '$amountPaise', 0] } },
        windowPayments: { $sum: { $cond: [{ $gte: ['$paidAt', since] }, 1, 0] } },
        firstPaidAt: { $min: '$paidAt' },
        lastPaidAt: { $max: '$paidAt' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return {
    windowDays: COLLECTED_WINDOW_DAYS,
    currencies: rows.map((row) => ({
      currency: row._id,
      totalPaise: row.totalPaise,
      payments: row.payments,
      windowPaise: row.windowPaise,
      windowPayments: row.windowPayments,
      firstPaidAt: row.firstPaidAt,
      lastPaidAt: row.lastPaidAt,
    })),
  };
}

async function recentAdminActions(limit = RECENT_ADMIN_ACTIONS) {
  const entries = await AdminAction.find({}).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const ids = [...new Set(entries.map((entry) => String(entry.businessId)))];
  const existing = ids.length
    ? new Set((await Business.find({ _id: { $in: ids } }).select('_id').lean()).map((item) => String(item._id)))
    : new Set();
  return entries.map((entry) => adminActionPublic(entry, { businessExists: existing.has(String(entry.businessId)) }));
}

async function getOverview(now = new Date()) {
  const [businesses, archived] = await Promise.all([
    Business.find({ archivedAt: null }).sort({ createdAt: -1, _id: -1 }).select(BUSINESS_FIELDS).lean(),
    Business.countDocuments({ archivedAt: { $ne: null } }),
  ]);
  const context = await loadContext(businesses);

  const statuses = Object.fromEntries(ACCOUNT_STATUSES.map((key) => [key, 0]));
  const closedStores = { closed_unverified: 0, closed_billing: 0, off: 0 };
  const trialPayment = { autopay: 0, checkout_started: 0, none: 0 };
  const payingByPlan = Object.fromEntries(PLAN_KEYS.map((key) => [key, 0]));
  const soonCutoff = new Date(now.getTime() + TRIAL_SOON_DAYS * DAY_MS);
  const endingSoon = [];

  businesses.forEach((business) => {
    const { subscription, store } = statusFor(business, context, now);
    statuses[subscription.accountStatus] += 1;
    if (store.state in closedStores) closedStores[store.state] += 1;
    if (subscription.accountStatus === 'trial') {
      trialPayment[subscription.trialPaymentMethod] += 1;
      const trialEnd = subscription.trialEndAt ? new Date(subscription.trialEndAt) : null;
      if (trialEnd && trialEnd > now && trialEnd <= soonCutoff) {
        endingSoon.push({ business, trialEndAt: subscription.trialEndAt, paymentMethod: subscription.trialPaymentMethod });
      }
    }
    if (subscription.accountStatus === 'active') {
      const plan = context.subsByBusiness.get(String(business._id))?.plan;
      payingByPlan[plan === 'advanced' ? 'advanced' : 'pro'] += 1;
    }
  });
  endingSoon.sort((a, b) => new Date(a.trialEndAt) - new Date(b.trialEndAt));

  const planRevenue = PLAN_KEYS.map((key) => ({
    key,
    name: PLANS[key].name,
    pricePerMonth: PLANS[key].amountDisplay,
    activeSubscriptions: payingByPlan[key] || 0,
  }));

  const recent = businesses.slice(0, RECENT_SIGNUPS);
  const [collected, adminActions] = await Promise.all([collectedPayments(now), recentAdminActions()]);

  return {
    totals: {
      businesses: businesses.length,
      archived,
      statuses,
      closedStores,
      trialPayment,
    },
    trialsEndingSoon: {
      windowDays: TRIAL_SOON_DAYS,
      count: endingSoon.length,
      withoutAutopay: endingSoon.filter((item) => item.paymentMethod !== 'autopay').length,
      items: endingSoon.slice(0, 10).map((item) => ({
        id: String(item.business._id),
        name: item.business.name,
        trialEndAt: item.trialEndAt,
        paymentMethod: item.paymentMethod,
      })),
    },
    // Estimate only: renewing paid subscriptions per plan × the server-side list price. Not money received.
    revenue: {
      currency: COVE_PRO.currency,
      activeSubscriptions: statuses.active,
      cancellingSubscriptions: statuses.cancelling,
      estimatedMrr: planRevenue.reduce((sum, item) => sum + item.activeSubscriptions * item.pricePerMonth, 0),
      plans: planRevenue,
    },
    collected,
    recentSignups: recent.map((business) => {
      const owner = context.ownersById.get(String(business.ownerId));
      return {
        id: String(business._id),
        name: business.name,
        slug: business.slug,
        category: business.category,
        createdAt: business.createdAt,
        archivedAt: null,
        owner: ownerSummary(owner),
        ...statusFor(business, context, now),
      };
    }),
    recentAdminActions: adminActions,
  };
}

function matchesFilter(filter, status, setup) {
  const { subscription } = status;
  switch (filter) {
    case 'needs_setup':
      return !setup.complete;
    case 'email_unverified':
      return !setup.emailVerified;
    case 'trial_no_autopay':
      return subscription.accountStatus === 'trial' && subscription.trialPaymentMethod !== 'autopay';
    default:
      return subscription.accountStatus === filter;
  }
}

async function listBusinesses(input = {}, now = new Date()) {
  const limit = boundedInt(input.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  let page = boundedInt(input.page, 1, 1, 10000);
  const search = typeof input.search === 'string'
    ? input.search.trim().slice(0, MAX_SEARCH_LENGTH)
    : '';
  const filter = LIST_FILTERS.includes(input.filter) ? input.filter : 'all';

  const query = {};
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    const matchingOwners = await User.find({ $or: [{ email: pattern }, { name: pattern }] })
      .select('businessId')
      .limit(500)
      .lean();
    query.$or = [
      { name: pattern },
      { slug: pattern },
      { _id: { $in: matchingOwners.map((item) => item.businessId) } },
    ];
  }
  if (filter === 'archived') query.archivedAt = { $ne: null };
  else if (filter !== 'all') query.archivedAt = null;

  let total;
  let pageBusinesses;
  if (filter === 'all' || filter === 'archived') {
    total = await Business.countDocuments(query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    if (totalPages > 0 && page > totalPages) page = totalPages;
    pageBusinesses = await Business.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(BUSINESS_FIELDS)
      .lean();
  } else {
    // Status and setup are derived, not stored, so the matching shops are worked out in memory.
    const candidates = await Business.find(query).sort({ createdAt: -1, _id: -1 }).select(BUSINESS_FIELDS).lean();
    const context = await loadContext(candidates);
    const products = filter === 'needs_setup' ? await productStats(candidates.map((item) => item._id)) : new Map();
    const matching = candidates.filter((business) => {
      const owner = context.ownersById.get(String(business.ownerId));
      const setup = setupFor(business, owner, products.get(String(business._id)));
      return matchesFilter(filter, statusFor(business, context, now), setup);
    });
    total = matching.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    if (totalPages > 0 && page > totalPages) page = totalPages;
    pageBusinesses = matching.slice((page - 1) * limit, page * limit);
  }

  return {
    businesses: await businessRows(pageBusinesses, now),
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    filter,
  };
}

function parseBusinessId(id) {
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id) || String(new mongoose.Types.ObjectId(id)) !== id) {
    throw new ApiError(404, 'We could not find that business.');
  }
  return id;
}

async function getBusinessDetail(id, now = new Date(), viewer = null) {
  const business = await Business.findById(parseBusinessId(id))
    .select(`name slug category city phone storefrontActive archivedAt createdAt ownerId ${PAYMENT_SETUP_FIELDS}`)
    .lean();
  if (!business) throw new ApiError(404, 'We could not find that business.');

  const businessId = business._id;
  const [
    owner,
    context,
    customers,
    customerWants,
    lastOrder,
    lastWant,
    products,
    orders,
    receipts,
    receiptTotals,
    history,
  ] = await Promise.all([
    User.findOne({ _id: business.ownerId, businessId }).select('name email emailVerified createdAt isPlatformAdmin').lean(),
    loadContext([business]),
    Customer.countDocuments({ businessId }),
    CustomerWant.countDocuments({ businessId }),
    Order.findOne({ businessId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    CustomerWant.findOne({ businessId }).sort({ createdAt: -1 }).select('createdAt').lean(),
    productStats([businessId]),
    orderStats([businessId]),
    SubscriptionReceipt.find({ businessId }).sort({ paidAt: -1, _id: -1 }).limit(BUSINESS_RECEIPTS_LIMIT).lean(),
    SubscriptionReceipt.aggregate([
      { $match: { businessId } },
      { $group: { _id: '$currency', totalPaise: { $sum: '$amountPaise' }, payments: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    AdminAction.find({ businessId }).sort({ createdAt: -1, _id: -1 }).limit(BUSINESS_HISTORY_LIMIT).lean(),
  ]);

  const productRow = products.get(String(businessId));
  const orderRow = orders.get(String(businessId));
  // Store activity includes what customers do; it does not show whether the seller is still using Cove.
  const lastActivity = latest([
    { type: 'order', label: 'Order received', at: lastOrder?.createdAt },
    { type: 'product', label: 'Product added', at: productRow?.lastProductAddedAt },
    { type: 'customer_request', label: 'Customer request received', at: lastWant?.createdAt },
  ]);
  const ownerView = owner ? ownerSummary(owner) : null;

  return {
    id: businessId.toString(),
    name: business.name,
    slug: business.slug,
    category: business.category,
    city: business.city || '',
    phone: business.phone || '',
    storefrontActive: business.storefrontActive !== false,
    archivedAt: business.archivedAt || null,
    createdAt: business.createdAt,
    owner: owner
      ? {
        ...ownerView,
        createdAt: owner.createdAt,
        isPlatformAdmin: owner.isPlatformAdmin === true,
        isYou: Boolean(viewer && String(viewer._id) === String(owner._id)),
      }
      : null,
    ...statusFor(business, context, now),
    setup: setupFor(business, ownerView, productRow),
    lastActivity,
    lastSellerActivity: lastSellerActivity(productRow, orderRow),
    firstStorefrontOrderAt: orderRow?.firstStorefrontOrderAt || null,
    counts: {
      products: productRow?.products || 0,
      activeProducts: productRow?.activeProducts || 0,
      orders: orderRow?.orders || 0,
      storefrontOrders: orderRow?.storefrontOrders || 0,
      customers,
      customerRequests: customerWants,
    },
    receipts: {
      items: receipts.map(receiptPublic),
      totals: receiptTotals.map((row) => ({ currency: row._id, totalPaise: row.totalPaise, payments: row.payments })),
    },
    adminHistory: history.map((entry) => adminActionPublic(entry)),
  };
}

function requireActingAdmin(admin) {
  if (!admin?._id) throw new ApiError(401, 'Please log in to continue.');
}

// Written in the same transaction as the change it records, so the change and its audit entry
// either both happen or neither does.
function recordAdminAction(session, action, admin, business, extra = {}) {
  return AdminAction.create([{
    action,
    adminUserId: admin._id,
    adminEmail: admin.email || '',
    businessId: business._id,
    businessName: business.name || '',
    businessSlug: business.slug || '',
    ...extra,
  }], { session });
}

async function inTransaction(work) {
  // The audit collection and its indexes cannot be created inside a transaction.
  await AdminAction.init();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function findBusinessForAction(id, admin) {
  requireActingAdmin(admin);
  const business = await Business.findById(parseBusinessId(id));
  if (!business) throw new ApiError(404, 'We could not find that business.');
  if (String(admin.businessId) === String(business._id)) {
    throw new ApiError(400, 'You cannot archive or delete your own shop from the admin panel.');
  }
  const adminMember = await User.exists({ businessId: business._id, isPlatformAdmin: true });
  if (adminMember) {
    throw new ApiError(400, 'This shop belongs to a platform admin and cannot be archived or deleted here.');
  }
  return business;
}

// Any Razorpay subscription Cove has not seen cancelled may still charge the seller. Fails closed:
// cancel-at-period-end and halted count until Razorpay reports cancelled. An unfinished checkout is
// first ended at Razorpay (releaseUnfinishedCheckout) and only counts if Razorpay says it progressed.
async function liveProviderSubscription(businessId, now) {
  await releaseUnfinishedCheckout(businessId, now);
  const subscription = await Subscription.findOne({ businessId })
    .select('status providerSubscriptionId cancelAtPeriodEnd currentPeriodEndAt')
    .lean();
  return isLiveProviderSubscription(subscription) ? subscription : null;
}

async function archiveBusiness(id, admin, now = new Date()) {
  const business = await findBusinessForAction(id, admin);
  if (!business.archivedAt) {
    // Archiving signs the owner out for good, so they could not cancel a subscription that keeps charging.
    const live = await liveProviderSubscription(business._id, now);
    if (live) throw new ApiError(409, archiveRefusal(live));
    await inTransaction(async (session) => {
      const updated = await Business.findOneAndUpdate(
        { _id: business._id, archivedAt: null },
        { $set: { archivedAt: now } },
        { new: true, session }
      );
      // Another admin archived it first: their entry already records it.
      if (!updated) return;
      // Re-checked here in case the seller started a checkout since the check above; throwing rolls back.
      const current = await Subscription.findOne({ businessId: business._id })
        .select('status providerSubscriptionId cancelAtPeriodEnd currentPeriodEndAt')
        .session(session)
        .lean();
      if (isLiveProviderSubscription(current)) throw new ApiError(409, archiveRefusal(current));
      // Sign the owner out everywhere; login is refused while the shop is archived.
      await User.updateMany({ businessId: business._id }, { $inc: { tokenVersion: 1 } }, { session });
      await recordAdminAction(session, 'archive', admin, updated);
    });
  }
  return getBusinessDetail(business._id.toString(), now, admin);
}

async function restoreBusiness(id, admin, now = new Date()) {
  const business = await findBusinessForAction(id, admin);
  if (business.archivedAt) {
    await inTransaction(async (session) => {
      const updated = await Business.findOneAndUpdate(
        { _id: business._id, archivedAt: { $ne: null } },
        { $set: { archivedAt: null } },
        { new: true, session }
      );
      if (updated) await recordAdminAction(session, 'restore', admin, updated);
    });
  }
  return getBusinessDetail(business._id.toString(), now, admin);
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
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
  if (await liveProviderSubscription(businessId, new Date())) {
    throw new ApiError(409, 'This shop still has a Razorpay subscription. Cancel it in Razorpay before deleting the shop.');
  }

  // One transaction: the shop's records, the shop and the audit entry all go, or nothing does.
  const deleted = await inTransaction(async (session) => {
    const current = await Business.findOne({ _id: businessId, archivedAt: { $ne: null } }).select('_id').session(session);
    if (!current) throw new ApiError(404, 'We could not find that business.');
    const scoped = { businessId };
    const counts = {};
    for (const [key, Model] of [
      ['products', Product],
      ['orders', Order],
      ['customers', Customer],
      ['customerWants', CustomerWant],
      ['customerWantVotes', CustomerWantVote],
      ['invoices', Invoice],
      ['notifications', Notification],
      ['storeEvents', StoreEvent],
      ['emailDeliveries', EmailDelivery],
      ['orderCounters', OrderCounter],
      ['subscriptions', Subscription],
      ['users', User],
    ]) {
      // Sequential: operations in one transaction must not run in parallel.
      // eslint-disable-next-line no-await-in-loop
      counts[key] = (await Model.deleteMany(scoped, { session })).deletedCount;
    }
    await Business.deleteOne({ _id: businessId }, { session });
    await recordAdminAction(session, 'delete', admin, business, {
      summary: `Deleted ${plural(counts.products, 'product')}, ${plural(counts.orders, 'order')} `
        + `and ${plural(counts.customers, 'customer')}.`,
    });
    return counts;
  });
  // Files are not in the database. Cleanup failures are logged, never thrown.
  await imageStorage.deleteBusinessImages(businessId);

  return {
    id: businessId.toString(),
    name: business.name,
    deleted: {
      products: deleted.products,
      orders: deleted.orders,
      customers: deleted.customers,
    },
  };
}

// Grants or revokes platform admin for a shop's owner. The caller is already a database-checked
// admin (requireAdmin); the owner's email must be retyped so a stale page cannot change the wrong
// account. Admins cannot change their own flag, so there is always at least one admin left.
async function setOwnerPlatformAdmin(id, admin, { grant, confirmEmail } = {}, now = new Date()) {
  requireActingAdmin(admin);
  if (typeof grant !== 'boolean') {
    throw new ApiError(400, 'Choose whether to grant or remove admin access.');
  }
  const business = await Business.findById(parseBusinessId(id)).select('name slug ownerId archivedAt').lean();
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
    await inTransaction(async (session) => {
      const result = await User.updateOne(
        { _id: owner._id, isPlatformAdmin: grant ? { $ne: true } : true },
        { $set: { isPlatformAdmin: grant } },
        { session }
      );
      if (result.modifiedCount !== 1) return;
      await recordAdminAction(session, grant ? 'grant_admin' : 'revoke_admin', admin, business, {
        targetUserId: owner._id,
        targetEmail: owner.email,
      });
    });
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
  LIST_FILTERS,
  LIVE_SUBSCRIPTION_ARCHIVE_MESSAGE,
  MAX_PAGE_SIZE,
};
