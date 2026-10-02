const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');
const mongoose = require('mongoose');

process.env.EMAIL_PROVIDER = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'true';
process.env.APP_URL = 'https://app.verify.cove.test';

const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const Order = require('../models/Order');
const OrderCounter = require('../models/OrderCounter');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const EmailDelivery = require('../models/EmailDelivery');
const StoreEvent = require('../models/StoreEvent');
const emailService = require('../services/emailService');
const billingService = require('../services/billingService');
const notifyEvents = require('../services/notifyEvents');
const { signToken } = require('../services/tokenService');
const { GENERIC_RESEND_MESSAGE, GENERIC_RESET_MESSAGE } = require('../services/authService');
const { EMAIL_UNVERIFIED_MESSAGE } = require('../middleware/requireVerifiedEmail');

const DAY_MS = 24 * 60 * 60 * 1000;
const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'VerifyTest123';
const createdBusinessIds = [];

let server;
let base;

async function api(method, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  if (text && (response.headers.get('content-type') || '').includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data, text, headers: response.headers };
}

function verificationEmailsTo(email) {
  return emailService.getMemoryOutbox().filter(
    (item) => item.to === email && item.meta?.kind === 'email_verification'
  );
}

function tokenFrom(message) {
  return new URL(message.meta.verifyUrl).searchParams.get('token');
}

function latestToken(email) {
  const sent = verificationEmailsTo(email);
  assert.ok(sent.length, 'expected a verification email');
  return tokenFrom(sent[sent.length - 1]);
}

async function register(label) {
  const email = `verify-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Verify ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOne({ email });
  createdBusinessIds.push(user.businessId);
  const business = await Business.findById(user.businessId);
  const product = await Product.create({
    businessId: user.businessId,
    name: `${label} Ring`,
    price: 250,
    stockQuantity: 10,
    status: 'Active',
  });
  return {
    email,
    registered,
    userId: user._id,
    token: signToken(user),
    businessId: user.businessId,
    slug: business.slug,
    productId: String(product._id),
  };
}

function publicOrder(seller) {
  return {
    customer: { name: 'Asha', phone: '9876512345' },
    items: [{ productId: seller.productId, quantity: 1 }],
    deliveryMethod: 'Pickup',
    paymentMethod: 'pay_on_pickup',
  };
}

async function storefront(seller) {
  const response = await api('GET', `/api/store/${seller.slug}`);
  assert.equal(response.status, 200);
  return response.data;
}

async function verify(token, sessionToken) {
  return api('POST', '/api/auth/verify-email', { body: { token }, token: sessionToken });
}

describe('seller email verification', { timeout: 300000 }, () => {
  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    emailService.clearMemoryOutbox();
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const scope = { businessId: { $in: createdBusinessIds } };
      await Promise.all([
        StoreEvent.deleteMany(scope),
        EmailDelivery.deleteMany(scope),
        Notification.deleteMany(scope),
        Order.deleteMany(scope),
        Customer.deleteMany(scope),
        Product.deleteMany(scope),
        OrderCounter.deleteMany(scope),
        Subscription.deleteMany(scope),
        User.deleteMany(scope),
      ]);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('1. a new seller starts unverified', async () => {
    const seller = await register('new');
    assert.equal(seller.registered.data.user.emailVerified, false);
    const me = await api('GET', '/api/auth/me', { token: seller.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.emailVerified, false);
    const stored = await User.findById(seller.userId)
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt')
      .lean();
    assert.equal(stored.emailVerified, false);
    assert.ok(stored.emailVerificationTokenHash);
    const ttl = stored.emailVerificationExpiresAt.getTime() - Date.now();
    assert.ok(ttl > 23 * 60 * 60 * 1000 && ttl <= DAY_MS, 'link expires in about 24 hours');
  });

  it('2. a verification email is sent through the email service using APP_URL', async () => {
    const seller = await register('mail');
    const sent = verificationEmailsTo(seller.email);
    assert.equal(sent.length, 1);
    const [message] = sent;
    assert.equal(message.subject, 'Verify your email for Cove');
    assert.ok(message.meta.verifyUrl.startsWith('https://app.verify.cove.test/verify-email?token='));
    assert.ok(!message.html.includes('localhost') && !message.text.includes('localhost'));
    assert.ok(message.html.includes('Verify your email'));
    assert.ok(message.html.includes('getcove.app@gmail.com'));
    assert.ok(message.text.includes('24 hours'));
    assert.ok(message.text.includes('confirms that you own this email address'));
  });

  it('3. the token is random, high-entropy, and only its hash is stored', async () => {
    const first = await register('tok1');
    const second = await register('tok2');
    const rawA = latestToken(first.email);
    const rawB = latestToken(second.email);
    assert.match(rawA, /^[a-f0-9]{64}$/);
    assert.notEqual(rawA, rawB);

    const stored = await User.findById(first.userId).select('+emailVerificationTokenHash').lean();
    assert.equal(stored.emailVerificationTokenHash, crypto.createHash('sha256').update(rawA).digest('hex'));
    assert.ok(!JSON.stringify(stored).includes(rawA), 'raw token must not be stored');
    assert.ok(!JSON.stringify(first.registered.data).includes(rawA), 'raw token must not be returned');
  });

  it('4. a valid token verifies the seller and unlocks seller actions', async () => {
    const seller = await register('valid');
    const result = await verify(latestToken(seller.email));
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.deepEqual(result.data, { message: 'Your email address is verified.', verified: true });

    const stored = await User.findById(seller.userId)
      .select('+emailVerificationTokenHash +emailVerificationExpiresAt')
      .lean();
    assert.equal(stored.emailVerified, true);
    assert.ok(stored.emailVerifiedAt);
    assert.equal(stored.emailVerificationTokenHash, undefined);
    assert.equal(stored.emailVerificationExpiresAt, undefined);

    assert.equal((await api('GET', '/api/auth/me', { token: seller.token })).data.user.emailVerified, true);
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Verified Ring', price: 300, stockQuantity: 5, status: 'Active' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const shop = await storefront(seller);
    assert.notEqual(shop.business.paused, true);
    assert.ok(shop.products.length > 0);
  });

  it('5. a used token cannot be reused', async () => {
    const seller = await register('reuse');
    const token = latestToken(seller.email);
    assert.equal((await verify(token)).status, 200);
    const again = await verify(token);
    assert.equal(again.status, 400);
    assert.equal(again.data.errors[0].message, 'token_invalid');
  });

  it('6. an expired token fails and leaves the seller unverified', async () => {
    const seller = await register('expired');
    const token = latestToken(seller.email);
    await User.updateOne(
      { _id: seller.userId },
      { $set: { emailVerificationExpiresAt: new Date(Date.now() - 60 * 1000) } }
    );
    const result = await verify(token);
    assert.equal(result.status, 400);
    assert.equal(result.data.errors[0].message, 'token_expired');
    assert.equal((await User.findById(seller.userId).lean()).emailVerified, false);
  });

  it('7. invalid tokens fail safely', async () => {
    const unknown = await verify(crypto.randomBytes(32).toString('hex'));
    assert.equal(unknown.status, 400);
    assert.equal(unknown.data.errors[0].message, 'token_invalid');
    assert.equal((await verify('short')).status, 400);
    const injected = await api('POST', '/api/auth/verify-email', { body: { token: { $ne: null } } });
    assert.equal(injected.status, 400);
    const missing = await api('POST', '/api/auth/verify-email', { body: {} });
    assert.equal(missing.status, 400);
    for (const response of [unknown, injected, missing]) {
      assert.ok(!/@example\.com/.test(response.text), 'no account details in errors');
    }
  });

  it('8. resend sends a new link and revokes the previous one', async () => {
    const seller = await register('resend');
    const oldToken = latestToken(seller.email);
    emailService.clearMemoryOutbox();

    const resent = await api('POST', '/api/auth/resend-verification', { token: seller.token });
    assert.equal(resent.status, 200);
    assert.equal(resent.data.message, GENERIC_RESEND_MESSAGE);
    const newToken = latestToken(seller.email);
    assert.notEqual(newToken, oldToken);

    assert.equal((await verify(oldToken)).status, 400);
    assert.equal((await verify(newToken)).status, 200);
    assert.equal((await api('POST', '/api/auth/resend-verification')).status, 401);
  });

  it('9. resend is rate limited per account', async () => {
    const seller = await register('limit');
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await api('POST', '/api/auth/resend-verification', { token: seller.token })).status);
    }
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    assert.equal(verificationEmailsTo(seller.email).length, 6, 'signup email plus five resends');
  });

  it('10. an unverified seller cannot perform protected actions or run a public store', async () => {
    const seller = await register('blocked');
    const blocked = [
      ['POST', '/api/products', { name: 'Blocked Ring', price: 100, stockQuantity: 1, status: 'Active' }],
      ['PATCH', `/api/products/${seller.productId}`, { price: 999 }],
      ['PATCH', '/api/business/settings', { name: 'Renamed Shop' }],
      ['POST', '/api/orders', publicOrder(seller)],
      ['POST', '/api/billing/subscription', { plan: 'pro' }],
    ];
    for (const [method, path, body] of blocked) {
      const response = await api(method, path, { token: seller.token, body });
      assert.equal(response.status, 403, `${method} ${path}`);
      assert.equal(response.data.message, EMAIL_UNVERIFIED_MESSAGE);
    }
    assert.equal((await Product.findById(seller.productId).lean()).price, 250);

    assert.equal((await api('GET', '/api/products', { token: seller.token })).status, 200);
    assert.equal((await api('GET', '/api/billing', { token: seller.token })).status, 200);

    const shop = await storefront(seller);
    assert.equal(shop.business.paused, true);
    assert.deepEqual(shop.products, []);
    const order = await api('POST', `/api/store/${seller.slug}/orders`, { body: publicOrder(seller) });
    assert.equal(order.status, 403);
    assert.ok((await billingService.pausedBusinessIds([seller.businessId])).has(String(seller.businessId)));

    emailService.clearMemoryOutbox();
    await notifyEvents.notifyNewOrder({
      businessId: seller.businessId,
      order: { id: new mongoose.Types.ObjectId(), orderNumber: 'TEST-1', total: 100, customer: { name: 'Asha' } },
    });
    assert.equal(emailService.getMemoryOutbox().filter((item) => item.to === seller.email).length, 0);
  });

  it('11. existing sellers created before verification are unaffected', async () => {
    const seller = await register('legacy');
    await User.collection.updateOne(
      { _id: seller.userId },
      { $unset: { emailVerified: '', emailVerificationTokenHash: '', emailVerificationExpiresAt: '' } }
    );
    const login = await api('POST', '/api/auth/login', { body: { email: seller.email, password } });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.emailVerified, true);
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Legacy Ring', price: 300, stockQuantity: 5, status: 'Active' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.notEqual((await storefront(seller)).business.paused, true);
    emailService.clearMemoryOutbox();
    const resent = await api('POST', '/api/auth/resend-verification', { token: seller.token });
    assert.equal(resent.status, 200);
    assert.equal(verificationEmailsTo(seller.email).length, 0);
  });

  it('12. password reset still works for unverified sellers', async () => {
    const seller = await register('reset');
    const requested = await api('POST', '/api/auth/forgot-password', { body: { email: seller.email } });
    assert.equal(requested.status, 200);
    assert.equal(requested.data.message, GENERIC_RESET_MESSAGE);
    const resetMail = emailService.getMemoryOutbox().find((item) => item.meta?.resetUrl && item.to === seller.email);
    assert.ok(resetMail);
    const resetToken = new URL(resetMail.meta.resetUrl).searchParams.get('token');
    const newPassword = 'VerifyReset456';
    const reset = await api('POST', '/api/auth/reset-password', {
      body: { token: resetToken, password: newPassword, confirmPassword: newPassword },
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    const login = await api('POST', '/api/auth/login', { body: { email: seller.email, password: newPassword } });
    assert.equal(login.status, 200);
  });

  it('13. verification does not bypass billing enforcement', async () => {
    const seller = await register('billing');
    assert.equal((await verify(latestToken(seller.email))).status, 200);
    assert.notEqual((await storefront(seller)).business.paused, true);

    await Subscription.updateOne(
      { businessId: seller.businessId },
      { $set: { trialEndAt: new Date(Date.now() - 60 * 1000) } }
    );
    const shop = await storefront(seller);
    assert.equal(shop.business.paused, true);
    const order = await api('POST', `/api/store/${seller.slug}/orders`, { body: publicOrder(seller) });
    assert.equal(order.status, 403);
    assert.equal(order.data.errors[0].message, 'store_paused');
  });

  it('14. verifying one account never grants access to another', async () => {
    const owner = await register('owner-a');
    const other = await register('owner-b');
    const otherToken = latestToken(other.email);

    const result = await verify(otherToken, owner.token);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('set-cookie'), null, 'verification must not create a session');
    assert.deepEqual(Object.keys(result.data).sort(), ['message', 'verified']);

    assert.equal((await User.findById(owner.userId).lean()).emailVerified, false);
    assert.equal((await User.findById(other.userId).lean()).emailVerified, true);
    const blocked = await api('PATCH', `/api/products/${owner.productId}`, { token: owner.token, body: { price: 1 } });
    assert.equal(blocked.status, 403);

    assert.equal((await verify(latestToken(owner.email))).status, 200);
    const crossTenant = await api('PATCH', `/api/products/${other.productId}`, { token: owner.token, body: { price: 1 } });
    assert.equal(crossTenant.status, 404);
    assert.equal((await Product.findById(other.productId).lean()).price, 250);
  });

  it('15. responses do not reveal whether accounts exist or are verified', async () => {
    const unverified = await register('enum-a');
    const verified = await register('enum-b');
    assert.equal((await verify(latestToken(verified.email))).status, 200);

    const resendUnverified = await api('POST', '/api/auth/resend-verification', { token: unverified.token });
    const resendVerified = await api('POST', '/api/auth/resend-verification', { token: verified.token });
    assert.deepEqual(resendUnverified.data, resendVerified.data);
    assert.equal(resendUnverified.status, resendVerified.status);

    const usedToken = latestToken(verified.email);
    const used = await verify(usedToken);
    const unknown = await verify(crypto.randomBytes(32).toString('hex'));
    assert.equal(used.status, unknown.status);
    assert.deepEqual(used.data, unknown.data);
    assert.ok(!used.text.includes(verified.email));

    const ignoredBody = await api('POST', '/api/auth/resend-verification', {
      token: unverified.token,
      body: { email: verified.email },
    });
    assert.equal(ignoredBody.status, 200);
    assert.equal(verificationEmailsTo(verified.email).length, 1, 'resend only ever emails the signed-in account');
  });

  it('16. opening the link with GET (as link scanners do) never verifies or uses up the token', async () => {
    const seller = await register('scanner');
    const token = latestToken(seller.email);
    const query = `?token=${encodeURIComponent(token)}`;

    const apiGet = await api('GET', `/api/auth/verify-email${query}`);
    assert.notEqual(apiGet.status, 200);
    await api('HEAD', `/api/auth/verify-email${query}`);
    await api('GET', `/verify-email${query}`);

    const stored = await User.findById(seller.userId).select('+emailVerificationTokenHash').lean();
    assert.equal(stored.emailVerified, false);
    assert.ok(stored.emailVerificationTokenHash, 'token must still be usable');

    assert.equal((await verify(token)).status, 200);
    assert.equal((await User.findById(seller.userId).lean()).emailVerified, true);
  });
});
