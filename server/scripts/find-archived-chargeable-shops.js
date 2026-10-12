/**
 * Operator-only, READ-ONLY: lists archived shops that still have a Razorpay subscription Cove has not
 * seen cancelled. Their owners cannot log in to cancel, so Razorpay may keep charging them.
 * Uses the same rule as the admin archive guard. It never writes to the database, never calls Razorpay,
 * and never changes a shop: resolve each one by hand (cancel the subscription in Razorpay, or restore the shop).
 *
 * Unfinished checkouts (never authorised, so no payment mandate) are listed separately: they cannot charge unless
 * the seller completes them, and Razorpay expires them two days after creation.
 *
 * Exit code: 0 when no shop can be charged, 2 when shops need attention, 1 on error.
 *
 * Usage (from the server folder). Only NODE_ENV=production connects to the production database (MONGODB_URI):
 *   NODE_ENV=production node scripts/find-archived-chargeable-shops.js
 *   NODE_ENV=production node scripts/find-archived-chargeable-shops.js --show-subscription-ids
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const USAGE = 'Usage: node scripts/find-archived-chargeable-shops.js [--show-subscription-ids]';

function parseArgs(argv) {
  const options = { showSubscriptionIds: false };
  for (const arg of argv) {
    if (arg === '--show-subscription-ids') {
      options.showSubscriptionIds = true;
    } else {
      throw new Error(`Unknown argument "${arg}". ${USAGE}`);
    }
  }
  return options;
}

function day(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : '-';
}

async function findArchivedChargeableShops() {
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const SubscriptionReceipt = require('../models/SubscriptionReceipt');
  const { isLiveProviderSubscription, isUnfinishedCheckout } = require('../utils/adminStatus');

  const archived = await Business.find({ archivedAt: { $ne: null } }).select('slug archivedAt').lean();
  if (!archived.length) return [];
  const businessIds = archived.map((business) => business._id);

  const subscriptions = (await Subscription.find({
    businessId: { $in: businessIds },
    providerSubscriptionId: { $nin: ['', null] },
  })
    .select('businessId status plan providerSubscriptionId lastProviderStatus cancelAtPeriodEnd currentPeriodEndAt pastDueSince')
    .lean())
    .filter(isLiveProviderSubscription);
  if (!subscriptions.length) return [];

  const lastPayments = await SubscriptionReceipt.aggregate([
    { $match: { businessId: { $in: subscriptions.map((sub) => sub.businessId) } } },
    { $group: { _id: '$businessId', lastPaidAt: { $max: '$paidAt' } } },
  ]);
  const lastPaidBy = new Map(lastPayments.map((row) => [String(row._id), row.lastPaidAt]));
  const businessesById = new Map(archived.map((business) => [String(business._id), business]));

  return subscriptions
    .map((sub) => {
      const business = businessesById.get(String(sub.businessId));
      return {
        businessId: String(sub.businessId),
        slug: business.slug,
        archivedAt: business.archivedAt,
        status: sub.status,
        plan: sub.plan || 'pro',
        providerStatus: sub.lastProviderStatus || '',
        providerSubscriptionId: sub.providerSubscriptionId,
        cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
        currentPeriodEndAt: sub.currentPeriodEndAt || null,
        pastDueSince: sub.pastDueSince || null,
        lastPaidAt: lastPaidBy.get(String(sub.businessId)) || null,
        unfinishedCheckout: isUnfinishedCheckout(sub),
      };
    })
    .sort((a, b) => new Date(a.archivedAt) - new Date(b.archivedAt));
}

// Shops are named by storefront link and shop id. Razorpay subscription ids are printed only on request.
function logShop(shop, { showSubscriptionIds, log }) {
  log(`${shop.slug} (shop id ${shop.businessId})`);
  log(`  Archived: ${day(shop.archivedAt)}`);
  log(`  Cove status: ${shop.status}${shop.cancelAtPeriodEnd ? ' (set to cancel at period end)' : ''}`
    + ` | Razorpay status last seen: ${shop.providerStatus || 'unknown'} | Plan: ${shop.plan}`);
  log(`  Current period ends: ${day(shop.currentPeriodEndAt)} | Past due since: ${day(shop.pastDueSince)}`
    + ` | Last recorded payment: ${day(shop.lastPaidAt)}`);
  if (showSubscriptionIds) log(`  Razorpay subscription: ${shop.providerSubscriptionId}`);
}

async function runDiagnostic({ showSubscriptionIds = false, log = console.log } = {}) {
  const shops = await findArchivedChargeableShops();
  const chargeable = shops.filter((shop) => !shop.unfinishedCheckout);
  const unfinished = shops.filter((shop) => shop.unfinishedCheckout);
  if (!shops.length) {
    log('No archived shops have a Razorpay subscription that could still charge. Nothing to do.');
    return { shops, chargeable, unfinished };
  }
  if (chargeable.length) {
    log(`${chargeable.length} archived shop(s) still have a Razorpay subscription that can charge:`);
    log('');
    chargeable.forEach((shop) => logShop(shop, { showSubscriptionIds, log }));
    log('');
    log('For each shop above, check the subscription in the Razorpay dashboard and either cancel it there');
    log('(Cove updates once the cancellation webhook arrives) or restore the shop so the owner can manage billing.');
  } else {
    log('No archived shops have a Razorpay subscription that can charge.');
  }
  if (unfinished.length) {
    log('');
    log(`${unfinished.length} archived shop(s) have an unfinished Razorpay checkout (never authorised, cannot charge`);
    log('unless completed; Razorpay expires these two days after creation). Low risk; cancel them in Razorpay if still open:');
    log('');
    unfinished.forEach((shop) => logShop(shop, { showSubscriptionIds, log }));
  }
  log('');
  log('Nothing was changed.');
  return { shops, chargeable, unfinished };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const mongoose = require('mongoose');
  let env;
  try {
    env = require('../config/env');
  } catch (err) {
    console.error(`Configuration error: ${err.message}`);
    process.exit(1);
  }
  const connectDB = require('../config/db');
  // Read-only: do not let model compilation build indexes or create collections on the target database.
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);

  console.log(`READ-ONLY check on database "${env.mongoDbName}" (${env.mongoUriVariable})`);
  await connectDB();
  try {
    const { chargeable } = await runDiagnostic(options);
    if (chargeable.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('find-archived-chargeable-shops failed:', err?.statusCode ? err.message : err?.name || 'Error');
    process.exit(1);
  });
}

module.exports = { parseArgs, findArchivedChargeableShops, runDiagnostic };
