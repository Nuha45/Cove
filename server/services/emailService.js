const crypto = require('crypto');
const env = require('../config/env');

const memoryOutbox = [];

function currentProvider() {
  return String(process.env.EMAIL_PROVIDER || env.email.provider || '').toLowerCase();
}

function isConfigured() {
  const provider = currentProvider();
  if (provider === 'console' || provider === 'memory') return true;
  if (provider === 'resend') return Boolean(env.email.apiKey && env.email.from);
  return false;
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

async function deliver({ to, subject, html, text, meta }) {
  const provider = currentProvider() || 'console';

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

  if (provider === 'console' || !isConfigured()) {
    if (env.nodeEnv !== 'production') {
      // Never log raw tokens. meta may include a redacted note only.
      console.info('[email]', {
        to,
        subject,
        provider: provider || 'unconfigured',
        preview: String(text || '').slice(0, 160),
      });
    }
    return { ok: true, skipped: !isConfigured(), provider: provider || 'none' };
  }

  if (provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.email.from,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Email provider failed (${response.status}): ${body.slice(0, 200)}`);
    }
    return { ok: true, provider: 'resend' };
  }

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

async function sendEmail(input) {
  try {
    return await deliver(input);
  } catch (err) {
    // Email must never crash business flows.
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
    `Open this link within 30 minutes to choose a new password:`,
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

  return sendEmail({
    to,
    subject,
    html,
    text,
    meta: currentProvider() === 'memory' || env.email.debugLinks
      ? { resetUrl }
      : { kind: 'password_reset' },
  });
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
};
