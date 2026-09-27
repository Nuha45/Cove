/**
 * Operator-only: grant or revoke Cove platform admin for an existing account.
 * Requires direct database access (MONGODB_URI in server/.env). There is no HTTP endpoint for this.
 *
 * Usage (from the server folder):
 *   node scripts/promote-admin.js owner@example.com
 *   node scripts/promote-admin.js owner@example.com --revoke
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const email = String(args.find((arg) => !arg.startsWith('--')) || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: node scripts/promote-admin.js <email> [--revoke]');
    process.exit(1);
  }

  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  const User = require('../models/User');

  await connectDB();
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No account found for ${email}. The owner must register normally first.`);
      process.exitCode = 1;
      return;
    }

    const next = !revoke;
    if (user.isPlatformAdmin === next) {
      console.log(`${email} is already ${next ? 'a platform admin' : 'not a platform admin'}. No change made.`);
      return;
    }

    user.isPlatformAdmin = next;
    await user.save();
    console.log(`${email} ${next ? 'is now a Cove platform admin' : 'is no longer a Cove platform admin'}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('promote-admin failed:', err.message);
  process.exit(1);
});
