/**
 * Operator-only, one-off: records subscription receipts for Razorpay payments made before Cove kept them.
 * For every Cove subscription linked to Razorpay, reads all of its paid Razorpay invoices (no date limit) and
 * records each captured payment through the same checks as live webhooks. Safe to re-run: a payment never
 * gets a second receipt, and existing receipts only gain a missing invoice link.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless --write is given.
 *
 * Usage (from the server folder). Only NODE_ENV=production connects to the production database (MONGODB_URI):
 *   NODE_ENV=production node scripts/backfill-subscription-receipts.js
 *   NODE_ENV=production node scripts/backfill-subscription-receipts.js --shop=<shop-link>
 *   NODE_ENV=production node scripts/backfill-subscription-receipts.js --write
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const USAGE = 'Usage: node scripts/backfill-subscription-receipts.js [--write] [--shop=<shop-link>]';

const OUTCOME_LABELS = {
  created: 'receipts created',
  would_create: 'receipts to create',
  linked: 'invoice links added to existing receipts',
  would_link: 'invoice links to add to existing receipts',
  exists: 'already recorded',
  duplicate_payment: 'skipped: another invoice already named the same payment',
  other_subscription: 'skipped: payment recorded under a different subscription',
  not_captured: 'skipped: no matching captured payment on Razorpay',
};

function parseArgs(argv) {
  const options = { write: false, shop: '' };
  for (const arg of argv) {
    if (arg === '--write') {
      options.write = true;
    } else if (arg.startsWith('--shop=')) {
      options.shop = arg.slice('--shop='.length).trim().toLowerCase();
      if (!options.shop) throw new Error(`--shop needs a shop link. ${USAGE}`);
    } else {
      throw new Error(`Unknown argument "${arg}". ${USAGE}`);
    }
  }
  return options;
}

function formatInr(paise) {
  return `INR ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Only Cove's own messages (ApiError) are shown. Other errors can quote raw ids, so only their type is.
function describeError(err) {
  if (err?.statusCode) return `${err.statusCode} ${err.message}`;
  return err?.name || 'Error';
}

function describeCounts(counts) {
  return Object.keys(OUTCOME_LABELS)
    .filter((key) => counts[key])
    .map((key) => `${counts[key]} ${OUTCOME_LABELS[key]}`)
    .join(', ');
}

/**
 * Runs the backfill on the current mongoose connection. Never prints Razorpay ids, emails or secrets:
 * shops are named by their storefront link only.
 */
async function runBackfill({ write = false, shop = '', log = console.log } = {}) {
  const Business = require('../models/Business');
  const Subscription = require('../models/Subscription');
  const ApiError = require('../utils/ApiError');
  const { backfillSubscriptionReceipts } = require('../services/subscriptionReceiptService');

  const filter = { providerSubscriptionId: { $nin: ['', null] } };
  if (shop) {
    const business = await Business.findOne({ slug: shop }).select('_id').lean();
    if (!business) throw new ApiError(404, `No shop found with the link "${shop}".`);
    filter.businessId = business._id;
  }
  const subscriptions = await Subscription.find(filter).sort({ createdAt: 1, _id: 1 });
  const businesses = await Business.find({ _id: { $in: subscriptions.map((sub) => sub.businessId) } })
    .select('slug')
    .lean();
  const slugs = new Map(businesses.map((business) => [String(business._id), business.slug]));

  const totals = { subscriptions: subscriptions.length, failed: 0, incomplete: 0, paidInvoices: 0, newPaise: 0, counts: {} };
  for (const subscription of subscriptions) {
    const label = slugs.get(String(subscription.businessId)) || '(deleted shop)';
    try {
      // eslint-disable-next-line no-await-in-loop
      const { outcomes, complete } = await backfillSubscriptionReceipts(subscription, { dryRun: !write });
      const counts = {};
      for (const { outcome, amountPaise } of outcomes) {
        counts[outcome] = (counts[outcome] || 0) + 1;
        totals.counts[outcome] = (totals.counts[outcome] || 0) + 1;
        if (outcome === 'created' || outcome === 'would_create') totals.newPaise += amountPaise;
      }
      totals.paidInvoices += outcomes.length;
      if (!complete) totals.incomplete += 1;
      const detail = describeCounts(counts);
      log(`${label}: ${outcomes.length} paid invoice(s)${detail ? ` - ${detail}` : ''}`
        + `${complete ? '' : ' - WARNING: invoice list stopped at the page limit, so older invoices were not read'}`);
    } catch (err) {
      totals.failed += 1;
      log(`${label}: FAILED (${describeError(err)}). Receipts recorded before the error are kept; re-run to finish.`);
    }
  }

  log('');
  log(write ? 'Summary (WRITE):' : 'Summary (DRY RUN - nothing was written; re-run with --write to record):');
  log(`  Subscriptions checked: ${totals.subscriptions} (failed: ${totals.failed}, incomplete: ${totals.incomplete})`);
  log(`  Paid invoices found: ${totals.paidInvoices}`);
  for (const key of Object.keys(OUTCOME_LABELS)) {
    if (totals.counts[key]) log(`  ${OUTCOME_LABELS[key]}: ${totals.counts[key]}`);
  }
  log(`  ${write ? 'Recorded' : 'Would record'}: ${formatInr(totals.newPaise)}`);
  return totals;
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
  const razorpayService = require('../services/razorpayService');

  try {
    razorpayService.getClient();
  } catch {
    console.error('Razorpay API keys are not configured for this environment (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET).');
    process.exit(1);
  }

  console.log(`${options.write ? 'WRITE' : 'DRY RUN'} on database "${env.mongoDbName}" (${env.mongoUriVariable})`
    + `${options.shop ? ` for shop ${options.shop}` : ' for every shop'}`);
  await connectDB();
  try {
    const totals = await runBackfill(options);
    if (totals.failed || totals.incomplete) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('backfill-subscription-receipts failed:', describeError(err));
    process.exit(1);
  });
}

module.exports = { parseArgs, runBackfill };
