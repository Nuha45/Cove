const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const { signToken, verifyToken } = require('../services/tokenService');
const { requireTrustedOrigin } = require('../middleware/originCheck');
const { publicStoreLimiter, PUBLIC_STORE_LIMIT } = require('../middleware/rateLimiter');
const storeRoutes = require('../routes/storeRoutes');

describe('JWT verification is pinned to HS256', () => {
  const user = { id: '64b000000000000000000001', businessId: '64b000000000000000000002', tokenVersion: 3 };

  it('verifies the HS256 tokens signToken issues', () => {
    const payload = verifyToken(signToken(user));
    assert.equal(payload.sub, user.id);
    assert.equal(payload.businessId, user.businessId);
    assert.equal(payload.tv, 3);
  });

  it('rejects an HS384 token even when signed with the same secret', () => {
    const forged = jwt.sign({ sub: user.id }, env.jwtSecret, { algorithm: 'HS384', expiresIn: '1h' });
    assert.throws(() => verifyToken(forged), /invalid algorithm/i);
  });

  it('rejects RS256 tokens signed with an attacker keypair', () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = jwt.sign({ sub: user.id }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
    assert.throws(() => verifyToken(forged), /invalid algorithm/i);
  });

  it('rejects alg:none tokens', () => {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
    assert.throws(() => verifyToken(forged), /signature is required|invalid algorithm/i);
  });
});

// Drives requireTrustedOrigin directly; the middleware answers synchronously via next() or res.
function runOriginCheck({ method = 'POST', headers = {} } = {}) {
  const req = { method, get: (name) => headers[String(name).toLowerCase()] };
  const outcome = { nextCalled: false, statusCode: null, body: null };
  const res = {
    status(code) {
      outcome.statusCode = code;
      return this;
    },
    json(body) {
      outcome.body = body;
    },
  };
  requireTrustedOrigin(req, res, () => {
    outcome.nextCalled = true;
  });
  return outcome;
}

describe('requireTrustedOrigin production hardening', () => {
  const originalProduction = env.isProduction;
  const trustedOrigin = env.clientOrigins[0];

  after(() => {
    env.isProduction = originalProduction;
  });

  it('production rejects unsafe writes carrying neither Origin nor Referer', () => {
    env.isProduction = true;
    const outcome = runOriginCheck({ method: 'POST' });
    assert.equal(outcome.nextCalled, false);
    assert.equal(outcome.statusCode, 403);
    assert.match(outcome.body.message, /blocked/i);
  });

  it('production allows header-less writes that present an Authorization header (cron scheduler)', () => {
    env.isProduction = true;
    const outcome = runOriginCheck({ method: 'POST', headers: { authorization: 'Bearer test' } });
    assert.equal(outcome.nextCalled, true);
  });

  it('production allows the trusted Origin (Vercel to Render browser writes)', () => {
    env.isProduction = true;
    const outcome = runOriginCheck({ method: 'POST', headers: { origin: trustedOrigin } });
    assert.equal(outcome.nextCalled, true);
  });

  it('production allows a trusted Referer when Origin is absent (older browsers)', () => {
    env.isProduction = true;
    const outcome = runOriginCheck({ method: 'PATCH', headers: { referer: `${trustedOrigin}/dashboard` } });
    assert.equal(outcome.nextCalled, true);
  });

  it('production still blocks foreign and opaque origins', () => {
    env.isProduction = true;
    for (const origin of ['https://evil.example', 'null']) {
      const outcome = runOriginCheck({ method: 'POST', headers: { origin } });
      assert.equal(outcome.nextCalled, false, origin);
      assert.equal(outcome.statusCode, 403, origin);
    }
  });

  it('development keeps allowing header-less writes (existing tests and local tools)', () => {
    env.isProduction = false;
    const outcome = runOriginCheck({ method: 'POST' });
    assert.equal(outcome.nextCalled, true);
  });

  it('never blocks safe methods, even from a foreign origin', () => {
    env.isProduction = true;
    const outcome = runOriginCheck({ method: 'GET', headers: { origin: 'https://evil.example' } });
    assert.equal(outcome.nextCalled, true);
  });
});

describe('public storefront rate limiter', () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    // Hop count (not `true`, which express-rate-limit rejects): lets each simulated shopper
    // present their own client IP via X-Forwarded-For, mirroring the production proxy setup.
    app.set('trust proxy', 1);
    app.get('/probe', publicStoreLimiter, (req, res) => res.json({ ok: true }));
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('stays generous for shoppers (at least 100 requests per 15 minutes per IP)', () => {
    assert.ok(PUBLIC_STORE_LIMIT >= 100, `PUBLIC_STORE_LIMIT is ${PUBLIC_STORE_LIMIT}`);
  });

  it('mounts the limiter on both public storefront GET routes', () => {
    for (const path of ['/:slug', '/:slug/products/:productId']) {
      const layer = storeRoutes.stack.find((entry) => entry.route?.path === path && entry.route.methods.get);
      assert.ok(layer, `GET ${path} is not registered`);
      assert.equal(layer.route.stack[0].handle, publicStoreLimiter, path);
    }
  });

  it('allows the full per-IP budget, then answers 429 with a friendly message', async () => {
    const ip = '203.0.113.10';
    let limitHeader;
    for (let i = 1; i <= PUBLIC_STORE_LIMIT; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${base}/probe`, { headers: { 'x-forwarded-for': ip } });
      assert.equal(response.status, 200, `request ${i} of ${PUBLIC_STORE_LIMIT}`);
      if (i === 1) limitHeader = response.headers.get('ratelimit-limit');
    }
    assert.equal(limitHeader, String(PUBLIC_STORE_LIMIT));

    const blocked = await fetch(`${base}/probe`, { headers: { 'x-forwarded-for': ip } });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.match(body.message, /too many requests/i);
  });

  it('does not let one exhausted IP block another shopper', async () => {
    const response = await fetch(`${base}/probe`, { headers: { 'x-forwarded-for': '203.0.113.99' } });
    assert.equal(response.status, 200);
  });
});
