const Subscription = require('../models/Subscription');
const Business = require('../models/Business');
const User = require('../models/User');
const env = require('../config/env');
const emailService = require('./emailService');
const advancedAnalyticsService = require('./advancedAnalyticsService');
const { sendOnce } = require('./notifyEvents');
const { hasAdvancedFeatures, ALLOWED, ENTITLEMENT_FIELDS } = require('../utils/entitlements');
const { localParts } = require('../utils/dateRange');

function dayString(date) {
  return date.toISOString().slice(0, 10);
}

// The report always covers the 7 full days before "today" in the analytics time zone.
function previousWeek(now = new Date()) {
  const today = localParts(now, env.analyticsTimeZone);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const from = new Date(todayUtc - 7 * 24 * 60 * 60 * 1000);
  const to = new Date(todayUtc - 24 * 60 * 60 * 1000);
  return { range: 'custom', from: dayString(from), to: dayString(to) };
}

async function eligibleBusinessIds(now) {
  const [subscriptions, adminBusinessIds] = await Promise.all([
    Subscription.find({
      $or: [
        { status: 'trialing', trialEndAt: { $gt: now } },
        { plan: 'advanced', status: { $in: [...ALLOWED] } },
      ],
    })
      .select(`businessId ${ENTITLEMENT_FIELDS}`)
      .lean(),
    // Platform admin shops are billing-exempt (see billingService.isBillingExempt).
    User.distinct('businessId', { isPlatformAdmin: true }),
  ]);
  const ids = subscriptions
    .filter((subscription) => hasAdvancedFeatures(subscription, now))
    .map((subscription) => String(subscription.businessId));
  return [...new Set([...ids, ...adminBusinessIds.map(String)])];
}

async function sendReportForBusiness(business, week, now) {
  const owner = await User.findOne({
    businessId: business._id,
    role: 'owner',
    emailVerified: { $ne: false },
  }).select('email').lean();
  if (!owner?.email) return 'no_owner';

  const [performance, products] = await Promise.all([
    advancedAnalyticsService.getPerformance(business._id, week, { now }),
    advancedAnalyticsService.getProductPerformance(business._id, week, { now, limit: 5 }),
  ]);
  const metrics = performance.metrics;
  const report = {
    rangeLabel: performance.range.label,
    uniqueVisitors: metrics.uniqueVisitors,
    productViews: metrics.productViews,
    orders: metrics.orders,
    revenue: metrics.revenue,
    addToCartRate: metrics.addToCartRate,
    conversionRate: metrics.conversionRate,
    topViewedProduct: products.topViewed[0]?.name || '',
    bestSellingProduct: products.bestSellers[0]?.name || '',
  };

  const sent = await sendOnce(
    { businessId: business._id, dedupeKey: `WEEKLY_REPORT:${week.from}`, kind: 'weekly_report' },
    () => emailService.sendSellerWeeklyReport({
      to: owner.email,
      businessName: business.name,
      report,
      currency: business.currency || 'INR',
      analyticsUrl: `${env.appUrl.replace(/\/$/, '')}/analytics`,
    })
  );
  return sent ? 'sent' : 'already_sent_or_failed';
}

/**
 * Sends one weekly report per eligible business. Safe to call repeatedly: the EmailDelivery
 * dedupe key (business + week start) prevents duplicates if the scheduler retries.
 */
async function runWeeklyReports({ now = new Date() } = {}) {
  const week = previousWeek(now);
  const ids = await eligibleBusinessIds(now);
  const businesses = ids.length
    ? await Business.find({ _id: { $in: ids }, emailWeeklyReport: { $ne: false }, archivedAt: null })
      .select('name currency emailWeeklyReport')
      .lean()
    : [];

  const summary = {
    week: { from: week.from, to: week.to },
    eligible: businesses.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  for (const business of businesses) {
    try {
      const result = await sendReportForBusiness(business, week, now);
      if (result === 'sent') summary.sent += 1;
      else summary.skipped += 1;
    } catch (err) {
      summary.failed += 1;
      console.error('[weekly-report]', String(business._id), err.message || err);
    }
  }
  console.info('[weekly-report]', JSON.stringify(summary));
  return summary;
}

module.exports = {
  runWeeklyReports,
  previousWeek,
};
