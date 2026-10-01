const crypto = require('crypto');
const env = require('../config/env');

const memoryOutbox = [];
let warnedUnconfigured = false;

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
  const summary = getEmailConfigSummary();
  console.info('[email-config]', {
    provider: summary.provider,
    apiKeyConfigured: summary.apiKeyConfigured,
    from: summary.from || '(none)',
    appUrl: summary.appUrl || '(none)',
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
    } else {
      console.error('[email]', { provider: 'resend', result: 'failed', status: response.status, error: detail, from });
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
  } else {
    console.info('[email]', { provider: 'resend', result: 'success', status: response.status, id: parsed?.id || undefined, from, subject });
  }

  return { ok: true, provider: 'resend', id: parsed?.id };
}

async function deliver({ to, subject, html, text, meta }) {
  const { provider, from, apiKey } = readEmailEnv();

  if (!provider) {
    if (env.nodeEnv === 'production') {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        console.warn('[email] EMAIL_PROVIDER is not set. Emails (password resets, order alerts) are not being sent.');
      }
    } else {
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

async function sendSellerNewOrder({ to, businessName, order, orderUrl, currency }) {
  const subject = `New order received · ${order.orderNumber}`;
  const total = formatMoney(order.total, currency);
  const text = [
    `${businessName} received a new order.`,
    `Order: ${order.orderNumber}`,
    `Customer: ${order.customer?.name || 'Customer'}`,
    `Total: ${total}`,
    orderUrl ? `Open: ${orderUrl}` : '',
  ].filter(Boolean).join('\n');

  const html = wrapHtml({
    title: 'New order received',
    bodyHtml: `
      <p><strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(order.customer?.name || 'a customer')}</p>
      <p>Total: <strong>${escapeHtml(total)}</strong></p>
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
    'Cove has not verified this payment. Check that the money reached you, then mark the order as paid in Cove.',
    orderUrl ? `Open: ${orderUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'Payment submitted',
    bodyHtml: `
      <p>A customer shared a payment reference for <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
      ${order.paymentReference ? `<p>Reference: ${escapeHtml(order.paymentReference)}</p>` : ''}
      <p style="color:#8a7b6c;font-size:13px;">Cove has not verified this payment. Check that the money reached you, then mark the order as paid in Cove.</p>
      ${orderUrl ? `<p><a href="${escapeHtml(orderUrl)}">Review order</a></p>` : ''}
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'payment_submitted', orderId: order.id } });
}

async function sendCustomerPaymentVerified({ to, businessName, order, currency }) {
  const subject = `Payment confirmed · ${order.orderNumber}`;
  const total = formatMoney(order.total, currency);
  const text = `${businessName} confirmed your payment of ${total} for order ${order.orderNumber}.`;
  const html = wrapHtml({
    title: 'Payment confirmed',
    bodyHtml: `
      <p>${escapeHtml(businessName)} confirmed payment for order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
      <p>Total: <strong>${escapeHtml(total)}</strong></p>
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'payment_verified', orderId: order.id } });
}

async function sendSellerCustomerWant({ to, businessName, wantPreview, wantsUrl }) {
  const subject = 'New customer request';
  const text = [
    `${businessName} received a new customer request.`,
    wantPreview,
    wantsUrl ? `Open: ${wantsUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'New customer request',
    bodyHtml: `
      <p>${escapeHtml(businessName)} received a new customer request.</p>
      <p>${escapeHtml(wantPreview)}</p>
      ${wantsUrl ? `<p><a href="${escapeHtml(wantsUrl)}">View requests</a></p>` : ''}
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'customer_want' } });
}

function formatMoney(amount, currency = 'INR') {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

async function sendSellerLowStock({ to, businessName, products, threshold, productsUrl }) {
  const subject = products.length === 1
    ? `Low stock · ${products[0].name}`
    : `Low stock · ${products.length} products`;
  const lines = products.map((item) => `${item.name}: ${item.stock === 0 ? 'out of stock' : `${item.stock} left`}`);
  const text = [
    `Some products in ${businessName} are at or below your low-stock level (${threshold}).`,
    ...lines,
    productsUrl ? `Manage stock: ${productsUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'Low stock alert',
    bodyHtml: `
      <p style="line-height:1.5;">These products are at or below your low-stock level of <strong>${escapeHtml(String(threshold))}</strong>:</p>
      <ul style="line-height:1.7;padding-left:18px;">
        ${products.map((item) => `<li>${escapeHtml(item.name)} — <strong>${item.stock === 0 ? 'out of stock' : `${escapeHtml(String(item.stock))} left`}</strong></li>`).join('')}
      </ul>
      ${productsUrl ? `<p><a href="${escapeHtml(productsUrl)}">Manage stock</a></p>` : ''}
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'low_stock', count: products.length } });
}

async function sendCustomerOrderConfirmation({ to, businessName, order, currency, confirmationUrl, invoiceUrl }) {
  const subject = `Order received · ${order.orderNumber}`;
  const total = formatMoney(order.total, currency);
  const text = [
    `Thanks for your order with ${businessName}.`,
    `Order: ${order.orderNumber}`,
    ...order.items.map((item) => `${item.quantity} × ${item.name}`),
    `Total: ${total}`,
    `Status: ${order.status}`,
    confirmationUrl ? `View your order: ${confirmationUrl}` : '',
    invoiceUrl ? `Invoice (PDF): ${invoiceUrl}` : '',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'Order received',
    bodyHtml: `
      <p style="line-height:1.5;">Thanks for your order with <strong>${escapeHtml(businessName)}</strong>.</p>
      <p style="margin:0 0 12px;">Order <strong>${escapeHtml(order.orderNumber)}</strong> · Status: ${escapeHtml(order.status)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${order.items.map((item) => `
          <tr>
            <td style="padding:6px 0;border-bottom:1px solid #eadfd4;">${escapeHtml(String(item.quantity))} × ${escapeHtml(item.name)}</td>
            <td style="padding:6px 0;border-bottom:1px solid #eadfd4;text-align:right;">${escapeHtml(formatMoney(item.subtotal, currency))}</td>
          </tr>`).join('')}
        ${Number(order.deliveryFee) > 0 ? `
          <tr>
            <td style="padding:6px 0;">Delivery</td>
            <td style="padding:6px 0;text-align:right;">${escapeHtml(formatMoney(order.deliveryFee, currency))}</td>
          </tr>` : ''}
        <tr>
          <td style="padding:8px 0;font-weight:bold;">Total</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;">${escapeHtml(total)}</td>
        </tr>
      </table>
      ${confirmationUrl ? `<p style="margin:20px 0 8px;"><a href="${escapeHtml(confirmationUrl)}">View your order</a></p>` : ''}
      ${invoiceUrl ? `<p style="margin:0;"><a href="${escapeHtml(invoiceUrl)}">Download invoice (PDF)</a></p>` : ''}
      <p style="line-height:1.5;font-size:13px;color:#8a7b6c;">Payment is confirmed by the shop directly. Keep this email for your records.</p>
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'order_confirmation', orderId: order.id } });
}

function percentLabel(value) {
  return value === null || value === undefined ? '—' : `${value.toFixed(2)}%`;
}

async function sendSellerWeeklyReport({ to, businessName, report, currency, analyticsUrl }) {
  const subject = `Cove weekly store report · ${businessName}`;
  const rows = [
    ['Visitors', String(report.uniqueVisitors)],
    ['Product views', String(report.productViews)],
    ['Orders', String(report.orders)],
    ['Revenue', formatMoney(report.revenue, currency)],
    ['Add-to-cart rate', percentLabel(report.addToCartRate)],
    ['Conversion rate', percentLabel(report.conversionRate)],
  ];
  const text = [
    `Cove weekly store report for ${businessName} (${report.rangeLabel})`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    report.topViewedProduct ? `Most viewed product: ${report.topViewedProduct}` : '',
    report.bestSellingProduct ? `Best selling product: ${report.bestSellingProduct}` : '',
    analyticsUrl ? `Open analytics: ${analyticsUrl}` : '',
    'You can turn this email off in Settings → Notifications.',
  ].filter(Boolean).join('\n');
  const html = wrapHtml({
    title: 'Weekly store report',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#8a7b6c;">${escapeHtml(businessName)} · ${escapeHtml(report.rangeLabel)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="padding:7px 0;border-bottom:1px solid #eadfd4;">${escapeHtml(label)}</td>
            <td style="padding:7px 0;border-bottom:1px solid #eadfd4;text-align:right;font-weight:bold;">${escapeHtml(value)}</td>
          </tr>`).join('')}
      </table>
      ${report.topViewedProduct ? `<p style="margin:16px 0 4px;">Most viewed product: <strong>${escapeHtml(report.topViewedProduct)}</strong></p>` : ''}
      ${report.bestSellingProduct ? `<p style="margin:4px 0;">Best selling product: <strong>${escapeHtml(report.bestSellingProduct)}</strong></p>` : ''}
      ${analyticsUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(analyticsUrl)}">Open analytics</a></p>` : ''}
      <p style="line-height:1.5;font-size:12px;color:#8a7b6c;">Visitors are counted anonymously. Turn this email off in Settings → Notifications.</p>
    `,
  });
  return sendEmail({ to, subject, html, text, meta: { kind: 'weekly_report' } });
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
  sendSellerLowStock,
  sendCustomerOrderConfirmation,
  sendSellerWeeklyReport,
  formatMoney,
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
