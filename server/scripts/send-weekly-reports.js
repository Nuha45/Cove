#!/usr/bin/env node
/**
 * Sends Cove Plus weekly seller reports once.
 *
 * Usage (from server/):  node scripts/send-weekly-reports.js
 *
 * Intended for a scheduler that can run commands (for example a Render Cron Job).
 * Re-running in the same week does not send duplicates.
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const weeklyReportService = require('../services/weeklyReportService');

async function main() {
  await mongoose.connect(env.mongoUri);
  try {
    const summary = await weeklyReportService.runWeeklyReports();
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[weekly-report] failed:', err.message || err);
  process.exitCode = 1;
});
