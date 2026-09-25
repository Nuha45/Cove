/**
 * Safe Resend diagnostic. Never prints API keys or reset tokens.
 * Usage: node scripts/diagnose-email.js [optional-to-email]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  // Load after dotenv so env.js sees current values.
  const emailService = require('../services/emailService');
  const summary = emailService.getEmailConfigSummary();

  console.log('[email-config]', {
    provider: summary.provider,
    apiKeyConfigured: summary.apiKeyConfigured,
    fromConfigured: summary.fromConfigured,
    from: summary.from,
    appUrlConfigured: summary.appUrlConfigured,
    appUrl: summary.appUrl,
  });

  if (summary.provider !== 'resend') {
    console.error('EMAIL_PROVIDER is not resend. Set EMAIL_PROVIDER=resend in server/.env and retry.');
    process.exit(1);
  }
  if (!summary.apiKeyConfigured || !summary.fromConfigured) {
    console.error('Resend is selected but EMAIL_API_KEY or EMAIL_FROM is missing.');
    process.exit(1);
  }

  const to = process.argv[2] || process.env.EMAIL_DIAGNOSTIC_TO;
  if (!to) {
    console.log('No recipient passed. Skipping live send.');
    console.log('Re-run: node scripts/diagnose-email.js you@example.com');
    process.exit(0);
  }

  const result = await emailService.sendEmail({
    to,
    subject: 'Cove email diagnostic',
    text: 'This is a Cove development diagnostic email. If you received it, Resend delivery works.',
    html: '<p>This is a Cove development diagnostic email. If you received it, Resend delivery works.</p>',
  });

  console.log('[email-diagnostic-result]', {
    ok: result.ok,
    provider: result.provider,
    skipped: result.skipped || false,
    error: result.error || null,
    id: result.id || null,
  });

  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[email-diagnostic-error]', err.message || err);
  process.exit(1);
});
