const crypto = require('crypto');
const env = require('../config/env');

const memoryOutbox = [];

function envValue(name, fallback = '') {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return String(process.env[name] ?? '').trim();
  }
  return String(fallback ?? '').trim();
}

function readEmailEnv() {
  return {
    provider: envValue('EMAIL_PROVIDER', env.email.provider).toLowerCase(),
    from: envValue('EMAIL_FROM', env.email.from),
    apiKey: envValue('EMAIL_API_KEY', env.email.apiKey),
    debugLinks: envValue('EMAIL_DEBUG_LINKS', env.email.debugLinks ? 'true' : '') === 'true',
  };
}

function currentProvider() {
  return readEmailEnv().provider;
}

function getEmailConfigSummary() {
  const { provider, from, apiKey } = readEmailEnv();
  return {
    provider: provider || '(none)',
    apiKeyConfigured: Boolean(apiKey),
    fromConfigured: Boolean(from),
    from,
    appUrlConfigured: Boolean(env.appUrl),
    appUrl: env.appUrl,
  };
}

function logEmailConfig() {
  if (env.nodeEnv === 'production') return;
  const summary = getEmailConfigSummary();
  console.info('[email-config]', {
    provider: summary.provider,
    apiKeyConfigured: summary.apiKeyConfigured,
    fromConfigured: summary.fromConfigured,
    appUrlConfigured: summary.appUrlConfigured,
  });
}

function isConfigured() {
  const { provider, from, apiKey } = readEmailEnv();
  if (provider === 'console' || provider === 'memory') return true;
  if (provider === 'resend') return Boolean(apiKey && from);
  if (!provider) return false;
  return false;
}

function assertResendConfigured() {
  const { provider, from, apiKey } = readEmailEnv();
  if (provider !== 'resend') return;
  if (!apiKey) {
    throw new Error(
      'EMAIL_PROVIDER=resend but EMAIL_API_KEY is missing. Add your Resend API key to server/.env and restart the API.'
    );
  }
  if (!from) {
    throw new Error(
      'EMAIL_PROVIDER=resend but EMAIL_FROM is missing. Set a Resend-verified sender in server/.env and restart the API.'
    );
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml({ title, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f3ee;font-family:Georgia,serif;color:#302b25;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eadfd4;border-radius:12px;padding:28px;">
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;color:#b06a3c;">COVE</p>
      <h1 style="margin:0 0 16px;font-size:24px;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="margin:28px 0 0;font-size:12px;color:#8a7b6c;">Cove helps small businesses manage orders and customers.</p>
    </div>
  </body>
</html>`;
}

function safeProviderError(status, bodyText) {
  const trimmed = String(bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  // Never echo Authorization headers or API keys if a proxy somehow included them.
  return trimmed
    .replace(/re_[A-Za-z0-9_]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

async function deliverViaResend({ to, subject, html, text, from, apiKey }) {
  if (env.nodeEnv !== 'production') {
    console.info('[email]', {
      provider: 'resend',
      action: 'sending',
      from,
      to,
      subject,
    });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const rawBody = await response.text().catch(() => '');
  let parsed = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = safeProviderError(
      response.status,
      (parsed && (parsed.message || parsed.error || parsed.name))
        || rawBody
        || response.statusText
    );
    if (env.nodeEnv !== 'production') {
      console.error('[email]', {
        provider: 'resend',
        result: 'failed',
        status: response.status,
        error: detail,
        from,
        to,
      });
    }
    throw new Error(`Resend email failed (${response.status}): ${detail}`);
  }

  if (env.nodeEnv !== 'production') {
    console.info('[email]', {
      provider: 'resend',
      result: 'success',
      id: parsed?.id || undefined,
      to,
      subject,
    });
  }

  return { ok: true, provider: 'resend', id: parsed?.id };
}

async function deliver({ to, subject, html, text, meta }) {
  const { provider, from, apiKey } = readEmailEnv();

  if (!provider) {
    if (env.nodeEnv !== 'production') {
      console.info('[email]', {
        to,
        subject,
        provider: 'unconfigured',
        skipped: true,
        preview: String(text || '').slice(0, 160),
      });
    }
    return { ok: true, skipped: true, provider: 'none' };
  }

  if (provider === 'memory') {
    memoryOutbox.push({
      to,
      subject,
      html,
      text,
      meta: meta || {},
      at: new Date().toISOString(),
    });
    return { ok: true, provider: 'memory' };
  }

  if (provider === 'console') {
    if (env.nodeEnv !== 'production') {
      console.info('[email]', {
        to,
        subject,
        provider: 'console',
        preview: String(text || '').slice(0, 160),
      });
    }
    return { ok: true, provider: 'console' };
  }

  if (provider === 'resend') {
    assertResendConfigured();
    return deliverViaResend({ to, subject, html, text, from, apiKey });
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

async function sendEmail(input) {
  try {
    return await deliver(input);
  } catch (err) {
    // Email must never crash business flows, but failures must be visible in development.
    console.error('[email:error]', err.message || err);
    return { ok: false, error: err.message || 'email_failed' };
  }
}

async function sendPasswordReset({ to, name, resetUrl }) {
  const subject = 'Reset your Cove password';
  const text = [
    `Hi ${name || 'there'},`,
    '',
    'We received a request to reset your Cove password.',
    'Open this link within 30 minutes to choose a new password:',
    resetUrl,
    '',
    'If you did not ask for this, you can ignore this email. Your password will stay the same.',
  ].join('\n');

  const html = wrapHtml({
    title: 'Reset your password',
    bodyHtml: `
      <p style="line-height:1.5;">Hi ${escapeHtml(name || 'there')},</p>
      <p style="line-height:1.5;">We received a request to reset your Cove password. This link expires in 30 minutes.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#e8743b;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;">
          Reset password
        </a>
      </p>
      <p style="line-height:1.5;font-size:13px;color:#8a7b6c;">If you did not request this, ignore this email. Your password will stay the same.</p>
    `,
  });

  const { provider, debugLinks } = readEmailEnv();
  const result = await sendEmail({
    to,
    subject,
    html,
    text,
    meta: provider === 'memory' || debugLinks
      ? { resetUrl }
      : { kind: 'password_reset' },
  });

  if (!result.ok && env.nodeEnv !== 'production') {
    console.error('[email] password reset send failed', {
      to,
      error: result.error,
    });
  }

  return result;
}

async function sendSellerNewOrder({ to, businessName, order, orderUrl }) {
  const subject = `New order received · ${order.orderNumber}`;
  const text = [
    `${businessName} received a new order.`,
    `Order: ${order.orderNumber}`,
    `Customer: ${order.customer?.name || 'Customer'}`,
    `Total: ${order.total}`,
    orderUrl ? `Open: ${orderUrl}` : '',
  ].filter(Boolean).join('\n');

  const html = wrapHtml({
    title: 'New order received',
    bodyHtml: `
      <p><strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(order.customer?.name || 'a customer')}</p>
      <p>Total: <strong>${escapeHtml(String(order.total))}</strong></p>
      ${orderUrl ? `<p><a href="${escapeHtml(orderUrl)}">View order</a></p>` : ''}
    `,
  });

  return sendEmail({ to, subject, html, text, meta: { kind: 'new_order', orderId: order.id } });
}

async function sendCustomerOrderStatus({ to, businessName, order }) {
  const subject = `Order update · ${order.orderNumber}`;
  const text = `${businessName} updated order ${order.orderNumber} to ${order.status}.`;
  const html = wrapHtml({
    title: 'Order update',
    bodyHtml: `
      <p>${escapeHtml(businessName)} updated your order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
      <p>Status: <strong>${escapeHtml(order.status)}</strong></p>
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'order_status', orderId: order.id } });
}

async function sendSellerPaymentSubmitted({ to, businessName, order, orderUrl }) {
  const subject = `Payment submitted · ${order.orderNumber}`;
  const text = [
    `A customer submitted a payment reference for ${order.orderNumber}.`,
    order.paymentReference ? `Reference: ${order.paymentReference}` : '',
    'This is not verified payment. Confirm it yourself in Cove.',
    orderUrl ? `Open: ${orderUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'Payment submitted',
    bodyHtml: `
      <p>Customer submitted payment details for <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
      ${order.paymentReference ? `<p>Reference: ${escapeHtml(order.paymentReference)}</p>` : ''}
      <p style="color:#8a7b6c;font-size:13px;">This is not verified payment. Confirm it yourself in Cove.</p>
      ${orderUrl ? `<p><a href="${escapeHtml(orderUrl)}">Review order</a></p>` : ''}
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'payment_submitted', orderId: order.id } });
}

async function sendCustomerPaymentVerified({ to, businessName, order }) {
  const subject = `Payment confirmed · ${order.orderNumber}`;
  const text = `${businessName} confirmed payment for order ${order.orderNumber}.`;
  const html = wrapHtml({
    title: 'Payment confirmed',
    bodyHtml: `
      <p>${escapeHtml(businessName)} confirmed payment for order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
      <p>Total: <strong>${escapeHtml(String(order.total))}</strong></p>
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'payment_verified', orderId: order.id } });
}

async function sendSellerCustomerWant({ to, businessName, wantPreview, wantsUrl }) {
  const subject = 'New customer request';
  const text = [
    `${businessName} received a new Customer Want.`,
    wantPreview,
    wantsUrl ? `Open: ${wantsUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'New customer request',
    bodyHtml: `
      <p>${escapeHtml(businessName)} received a new Customer Want.</p>
      <p>${escapeHtml(wantPreview)}</p>
      ${wantsUrl ? `<p><a href="${escapeHtml(wantsUrl)}">View requests</a></p>` : ''}
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'customer_want' } });
}

function getMemoryOutbox() {
  return memoryOutbox.slice();
}

function clearMemoryOutbox() {
  memoryOutbox.length = 0;
}

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  sendEmail,
  sendPasswordReset,
  sendSellerNewOrder,
  sendCustomerOrderStatus,
  sendSellerPaymentSubmitted,
  sendCustomerPaymentVerified,
  sendSellerCustomerWant,
  isConfigured,
  getMemoryOutbox,
  clearMemoryOutbox,
  createResetToken,
  hashResetToken,
  getEmailConfigSummary,
  logEmailConfig,
  currentProvider,
  readEmailEnv,
};
