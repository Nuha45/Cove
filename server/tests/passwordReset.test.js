process.env.EMAIL_PROVIDER = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'false';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const OrderCounter = require('../models/OrderCounter');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const { signToken } = require('../services/tokenService');
const emailService = require('../services/emailService');
const { GENERIC_RESET_MESSAGE } = require('../services/authService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'ResetTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `reset-${label}-${stamp}@example.com`;
}

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
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { status: response.status, data, headers: response.headers };
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Reset Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOne({ email });
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    userId: user._id,
  };
}

describe('passwordReset', { timeout: 180000 }, () => {
  let owner;

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
  });

  beforeEach(() => {
    emailService.clearMemoryOutbox();
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await Notification.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Order.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Product.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Customer.deleteMany({ businessId: { $in: createdBusinessIds } });
      await OrderCounter.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Subscription.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('returns a generic message for known and unknown emails and never exposes the token', async () => {
    const known = await api('POST', '/api/auth/forgot-password', {
      body: { email: owner.email },
    });
    assert.equal(known.status, 200);
    assert.equal(known.data.message, GENERIC_RESET_MESSAGE);
    assert.equal(known.data.token, undefined);
    assert.equal(JSON.stringify(known.data).includes('passwordReset'), false);

    const unknown = await api('POST', '/api/auth/forgot-password', {
      body: { email: uniqueEmail('missing') },
    });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.data.message, GENERIC_RESET_MESSAGE);

    const mail = emailService.getMemoryOutbox().find((item) => item.to === owner.email);
    assert.ok(mail);
    assert.ok(mail.meta.resetUrl);
    assert.match(mail.subject, /reset/i);
  });

  it('resets the password once, invalidates sessions, and rejects reused or expired tokens', async () => {
    await api('POST', '/api/auth/forgot-password', { body: { email: owner.email } });
    const mail = emailService.getMemoryOutbox().at(-1);
    const url = new URL(mail.meta.resetUrl);
    const token = url.searchParams.get('token');
    assert.ok(token);

    const userBefore = await User.findById(owner.userId);
    const oldVersion = userBefore.tokenVersion;
    const oldCookie = signToken(userBefore);

    const mismatch = await api('POST', '/api/auth/reset-password', {
      body: { token, password: 'NewPass99', confirmPassword: 'OtherPass99' },
    });
    assert.equal(mismatch.status, 400);

    const reset = await api('POST', '/api/auth/reset-password', {
      body: { token, password: 'NewPass99', confirmPassword: 'NewPass99' },
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));

    const userAfter = await User.findById(owner.userId).select('+passwordResetTokenHash +passwordHash');
    assert.equal(userAfter.passwordResetTokenHash, undefined);
    assert.equal(userAfter.tokenVersion, oldVersion + 1);

    const oldLogin = await api('POST', '/api/auth/login', {
      body: { email: owner.email, password },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await api('POST', '/api/auth/login', {
      body: { email: owner.email, password: 'NewPass99' },
    });
    assert.equal(newLogin.status, 200);

    const staleMe = await api('GET', '/api/auth/me', { token: oldCookie });
    assert.equal(staleMe.status, 401);

    const reused = await api('POST', '/api/auth/reset-password', {
      body: { token, password: 'Another99', confirmPassword: 'Another99' },
    });
    assert.equal(reused.status, 400);

    await api('POST', '/api/auth/forgot-password', { body: { email: owner.email } });
    const secondMail = emailService.getMemoryOutbox().at(-1);
    const secondToken = new URL(secondMail.meta.resetUrl).searchParams.get('token');
    const hashed = emailService.hashResetToken(secondToken);
    await User.updateOne(
      { _id: owner.userId },
      { $set: { passwordResetExpiresAt: new Date(Date.now() - 60_000), passwordResetTokenHash: hashed } }
    );
    const expired = await api('POST', '/api/auth/reset-password', {
      body: { token: secondToken, password: 'FreshPass1', confirmPassword: 'FreshPass1' },
    });
    assert.equal(expired.status, 400);

    // Restore a known password for later suites that might share DB state if needed.
    await api('POST', '/api/auth/forgot-password', { body: { email: owner.email } });
    const restoreMail = emailService.getMemoryOutbox().at(-1);
    const restoreToken = new URL(restoreMail.meta.resetUrl).searchParams.get('token');
    await api('POST', '/api/auth/reset-password', {
      body: { token: restoreToken, password, confirmPassword: password },
    });
  });

  it('rejects invalid reset tokens without leaking details', async () => {
    const bad = await api('POST', '/api/auth/reset-password', {
      body: {
        token: 'a'.repeat(64),
        password: 'ValidPass1',
        confirmPassword: 'ValidPass1',
      },
    });
    assert.equal(bad.status, 400);
    assert.match(String(bad.data.message || ''), /invalid or expired/i);
  });

  it('rate limits forgot-password requests', async () => {
    const results = [];
    for (let i = 0; i < 8; i += 1) {
      const response = await api('POST', '/api/auth/forgot-password', {
        body: { email: uniqueEmail(`rate-${i}`) },
      });
      results.push(response.status);
    }
    assert.equal(results.includes(429), true, JSON.stringify(results));
  });
});
