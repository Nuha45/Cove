process.env.EMAIL_PROVIDER = 'memory';
process.env.COVE_GRANT_TRIAL_ON_REGISTER = 'true';
process.env.COVE_ENFORCE_BILLING = 'false';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Notification = require('../models/Notification');
const Subscription = require('../models/Subscription');
const { signToken } = require('../services/tokenService');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'ChangeTest1';
const createdBusinessIds = [];

let server;
let base;

function uniqueEmail(label) {
  return `change-${label}-${stamp}@example.com`;
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

function cookieToken(headers) {
  const match = /cove_token=([^;]+)/.exec(headers.get('set-cookie') || '');
  return match ? match[1] : '';
}

function fieldErrors(response) {
  return Object.fromEntries((response.data.errors || []).map((item) => [item.field, item.message]));
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Change Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  createdBusinessIds.push(user.businessId);
  return { email, token: signToken(user), userId: user._id };
}

async function login(email, candidate) {
  return api('POST', '/api/auth/login', { body: { email, password: candidate } });
}

describe('changePassword', { timeout: 180000 }, () => {
  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (createdBusinessIds.length) {
      await Notification.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Subscription.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('changes the password, signs out other sessions and keeps this one signed in', async () => {
    const seller = await registerTenant('success');
    const before = await User.findById(seller.userId).select('+passwordHash');
    const otherSession = signToken(before);

    const changed = await api('POST', '/api/auth/change-password', {
      token: seller.token,
      body: { currentPassword: password, newPassword: 'BrandNew22', confirmPassword: 'BrandNew22' },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.message, 'Your password has been changed.');
    assert.equal(changed.data.user.email, seller.email);
    assert.equal(JSON.stringify(changed.data).includes('passwordHash'), false);

    const after = await User.findById(seller.userId).select('+passwordHash');
    assert.equal(after.tokenVersion, before.tokenVersion + 1);
    assert.notEqual(after.passwordHash, before.passwordHash);
    assert.match(after.passwordHash, /^\$2[aby]\$12\$/);

    assert.equal((await api('GET', '/api/auth/me', { token: otherSession })).status, 401);
    assert.equal((await api('GET', '/api/auth/me', { token: seller.token })).status, 401);
    const freshToken = cookieToken(changed.headers);
    assert.ok(freshToken);
    assert.equal((await api('GET', '/api/auth/me', { token: freshToken })).status, 200);

    assert.equal((await login(seller.email, password)).status, 401);
    assert.equal((await login(seller.email, 'BrandNew22')).status, 200);
  });

  it('rejects a wrong current password without changing anything', async () => {
    const seller = await registerTenant('wrong');
    const before = await User.findById(seller.userId).select('+passwordHash');

    const rejected = await api('POST', '/api/auth/change-password', {
      token: seller.token,
      body: { currentPassword: 'NotMyPass9', newPassword: 'BrandNew22', confirmPassword: 'BrandNew22' },
    });
    assert.equal(rejected.status, 400);
    assert.equal(fieldErrors(rejected).currentPassword, 'Your current password is incorrect.');
    assert.equal(cookieToken(rejected.headers), '');

    const after = await User.findById(seller.userId).select('+passwordHash');
    assert.equal(after.tokenVersion, before.tokenVersion);
    assert.equal(after.passwordHash, before.passwordHash);
    assert.equal((await api('GET', '/api/auth/me', { token: seller.token })).status, 200);
    assert.equal((await login(seller.email, password)).status, 200);
  });

  it('validates the new password and confirmation on the server', async () => {
    const seller = await registerTenant('invalid');
    const cases = [
      [{ newPassword: 'BrandNew22', confirmPassword: 'BrandNew22' }, 'currentPassword'],
      [{ currentPassword: password, newPassword: 'short1', confirmPassword: 'short1' }, 'newPassword'],
      [{ currentPassword: password, newPassword: 'lettersonly', confirmPassword: 'lettersonly' }, 'newPassword'],
      [{ currentPassword: password, newPassword: password, confirmPassword: password }, 'newPassword'],
      [{ currentPassword: password, newPassword: 'BrandNew22', confirmPassword: 'BrandNew23' }, 'confirmPassword'],
    ];
    for (const [body, field] of cases) {
      // eslint-disable-next-line no-await-in-loop
      const response = await api('POST', '/api/auth/change-password', { token: seller.token, body });
      assert.equal(response.status, 400, `${field}: ${JSON.stringify(response.data)}`);
      assert.ok(fieldErrors(response)[field], `expected an error for ${field}: ${JSON.stringify(response.data)}`);
    }

    const user = await User.findById(seller.userId);
    assert.equal((await api('GET', '/api/auth/me', { token: seller.token })).status, 200);
    assert.equal(user.tokenVersion, 0);
    assert.equal((await login(seller.email, password)).status, 200);
  });

  it('requires a signed-in seller', async () => {
    const body = { currentPassword: password, newPassword: 'BrandNew22', confirmPassword: 'BrandNew22' };
    assert.equal((await api('POST', '/api/auth/change-password', { body })).status, 401);
    assert.equal((await api('POST', '/api/auth/change-password', { token: 'not-a-real-token', body })).status, 401);

    const seller = await registerTenant('stale');
    const stale = await User.findById(seller.userId);
    await User.updateOne({ _id: seller.userId }, { $inc: { tokenVersion: 1 } });
    const staleResponse = await api('POST', '/api/auth/change-password', { token: signToken(stale), body });
    assert.equal(staleResponse.status, 401);
    assert.equal((await login(seller.email, password)).status, 200);
  });
});
