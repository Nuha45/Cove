const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Load env, then control EMAIL_* via process.env for each case.
require('../config/env');
const emailService = require('../services/emailService');

function setEmailEnv({ provider = '', from = '', apiKey = '', debugLinks = 'false' } = {}) {
  process.env.EMAIL_PROVIDER = provider;
  process.env.EMAIL_FROM = from;
  process.env.EMAIL_API_KEY = apiKey;
  process.env.EMAIL_DEBUG_LINKS = debugLinks;
}

describe('emailService providers', () => {
  let originalFetch;
  let previousEnv;

  beforeEach(() => {
    previousEnv = {
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
      EMAIL_FROM: process.env.EMAIL_FROM,
      EMAIL_API_KEY: process.env.EMAIL_API_KEY,
      EMAIL_DEBUG_LINKS: process.env.EMAIL_DEBUG_LINKS,
    };
    originalFetch = global.fetch;
    emailService.clearMemoryOutbox();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.EMAIL_PROVIDER = previousEnv.EMAIL_PROVIDER;
    process.env.EMAIL_FROM = previousEnv.EMAIL_FROM;
    process.env.EMAIL_API_KEY = previousEnv.EMAIL_API_KEY;
    process.env.EMAIL_DEBUG_LINKS = previousEnv.EMAIL_DEBUG_LINKS;
    mock.restoreAll();
  });

  it('selects console provider without calling Resend', async () => {
    setEmailEnv({ provider: 'console' });
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      return { ok: true, text: async () => '{}' };
    };

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'console');
    assert.equal(fetchCalled, false);
  });

  it('selects resend and posts to the Resend API with the correct recipient', async () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: 're_test_key_not_real',
    });

    let captured;
    global.fetch = async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        text: async () => JSON.stringify({ id: 'email_test_1' }),
      };
    };

    const result = await emailService.sendPasswordReset({
      to: 'buyer@example.com',
      name: 'Buyer',
      resetUrl: 'http://localhost:5173/reset-password?token=abc123tokenabc123tokenabc123token12',
    });

    assert.equal(result.ok, true);
    assert.equal(result.provider, 'resend');
    assert.equal(captured.url, 'https://api.resend.com/emails');
    assert.equal(captured.options.method, 'POST');
    assert.match(captured.options.headers.Authorization, /^Bearer re_test_key_not_real$/);
    const body = JSON.parse(captured.options.body);
    assert.deepEqual(body.to, ['buyer@example.com']);
    assert.equal(body.from, 'Cove <onboarding@resend.dev>');
    assert.match(body.subject, /reset/i);
    assert.match(body.text, /reset-password\?token=/);
    assert.equal(String(captured.options.body).includes('re_test_key_not_real'), false);
  });

  it('sends verification and reset emails with a unique X-Entity-Ref-ID so Gmail does not collapse them', async () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: 're_test_key_not_real',
    });
    const bodies = [];
    global.fetch = async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true, text: async () => JSON.stringify({ id: `email_${bodies.length}` }) };
    };

    const verify = { to: 'seller@example.com', name: 'Seller', verifyUrl: 'https://app.test/verify-email?token=x', expiresInHours: 24 };
    await emailService.sendEmailVerification(verify);
    await emailService.sendEmailVerification(verify);
    await emailService.sendPasswordReset({ to: 'seller@example.com', name: 'Seller', resetUrl: 'https://app.test/reset-password?token=y' });

    const ids = bodies.map((body) => body.headers?.['X-Entity-Ref-ID']);
    ids.forEach((id) => assert.match(id, /^[0-9a-f-]{36}$/));
    assert.equal(new Set(ids).size, 3, 'every send gets its own id');
    assert.equal(bodies[0].subject, bodies[1].subject);
    assert.match(bodies[0].html, /Verify your email/);

    await emailService.sendEmail({ to: 'seller@example.com', subject: 'Hello', text: 'Body', html: '<p>Body</p>' });
    assert.equal(bodies[3].headers, undefined, 'other emails are unchanged');
  });

  it('returns a clear configuration error when Resend API key is missing', async () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: '',
    });

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /EMAIL_API_KEY/i);
    assert.equal(result.provider, undefined);
  });

  it('returns a clear configuration error when Resend sender is missing', async () => {
    setEmailEnv({
      provider: 'resend',
      from: '',
      apiKey: 're_test_key_not_real',
    });

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /EMAIL_FROM/i);
  });

  it('does not silently fall back to console when Resend fails', async () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: 're_test_key_not_real',
    });

    global.fetch = async () => ({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => JSON.stringify({
        message: 'The getcove.app@gmail.com domain is not verified.',
      }),
    });

    const result = await emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      text: 'Body',
      html: '<p>Body</p>',
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /Resend email failed \(403\)/i);
    assert.match(result.error, /not verified/i);
    assert.equal(result.skipped, undefined);
    assert.notEqual(result.provider, 'console');
  });

  it('builds the password reset URL from APP_URL without leaking secrets in config summary', async () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: 're_secret_should_not_appear',
    });

    const summary = emailService.getEmailConfigSummary();
    assert.equal(summary.provider, 'resend');
    assert.equal(summary.apiKeyConfigured, true);
    assert.equal(summary.fromConfigured, true);
    assert.equal(summary.appUrlConfigured, true);
    assert.equal(JSON.stringify(summary).includes('re_secret_should_not_appear'), false);

    let body;
    global.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, text: async () => JSON.stringify({ id: 'email_2' }) };
    };

    const token = 'a'.repeat(64);
    await emailService.sendPasswordReset({
      to: 'owner@example.com',
      name: 'Owner',
      resetUrl: `http://localhost:5173/reset-password?token=${token}`,
    });

    assert.match(body.text, new RegExp(`token=${token}`));
    assert.match(body.html, /reset-password\?token=/);
  });

  it('config summary never includes the API key', () => {
    setEmailEnv({
      provider: 'resend',
      from: 'Cove <onboarding@resend.dev>',
      apiKey: 're_test_secret_should_not_leak',
    });
    const summary = emailService.getEmailConfigSummary();
    const serialized = JSON.stringify(summary);
    assert.equal(serialized.includes('re_test_secret_should_not_leak'), false);
    assert.equal(summary.apiKeyConfigured, true);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'apiKey'), false);
  });
});
