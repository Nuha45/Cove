const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const app = require('../app');
const User = require('../models/User');
const Product = require('../models/Product');
const Business = require('../models/Business');
const { signToken } = require('../services/tokenService');
const aiProvider = require('../services/aiProvider');
const env = require('../config/env');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'MarketingTest1';
const createdBusinessIds = [];

let server;
let base;
const originalApiKey = env.ai.apiKey;

function uniqueEmail(label) {
  return `phase8b-${label}-${stamp}@example.com`;
}

async function api(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { cookie: `cove_token=${token}` } : {}),
      ...headers,
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
  return { status: response.status, data };
}

async function registerTenant(label) {
  const email = uniqueEmail(label);
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Shop ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOne({ email });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return {
    email,
    token: signToken(user),
    businessId: user.businessId,
    slug: business.slug,
  };
}

async function addProduct(token, input) {
  const response = await api('POST', '/api/products', { token, body: input });
  assert.equal(response.status, 201, JSON.stringify(response.data));
  return response.data.product;
}

function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  assert.equal(text.includes('apiKey'), false);
  assert.equal(text.includes('OPENAI_API_KEY'), false);
  assert.equal(/sk-[A-Za-z0-9]{10,}/.test(text), false);
  assert.equal(text.includes(originalApiKey || '___none___') && Boolean(originalApiKey), false);
}

describe('marketing', { timeout: 180000 }, () => {
  let owner;
  let other;
  let product;
  let otherProduct;

  before(async () => {
    await connectDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    owner = await registerTenant('owner');
    other = await registerTenant('other');
    product = await addProduct(owner.token, {
      name: 'Pearl Drop Necklace',
      description: 'Handmade pearl necklace for everyday wear.',
      price: 1200,
      stockQuantity: 8,
      category: 'Necklaces',
      status: 'Active',
    });
    otherProduct = await addProduct(other.token, {
      name: 'Other Shop Ring',
      price: 500,
      stockQuantity: 4,
      status: 'Active',
    });
  });

  afterEach(() => {
    aiProvider.resetGenerateForTests();
    env.ai.apiKey = originalApiKey;
  });

  after(async () => {
    aiProvider.resetGenerateForTests();
    env.ai.apiKey = originalApiKey;
    if (createdBusinessIds.length) {
      await Product.deleteMany({ businessId: { $in: createdBusinessIds } });
      await User.deleteMany({ businessId: { $in: createdBusinessIds } });
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const status = await api('GET', '/api/marketing/status');
    assert.equal(status.status, 401);

    const generate = await api('POST', '/api/marketing/generate', {
      body: {
        productId: product.id,
        contentType: 'Instagram Caption',
        tone: 'Friendly',
      },
    });
    assert.equal(generate.status, 401);
  });

  it('rejects invalid content type and tone', async () => {
    const badType = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      body: {
        productId: product.id,
        contentType: 'TikTok Script',
        tone: 'Friendly',
      },
    });
    assert.equal(badType.status, 400);

    const badTone = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      body: {
        productId: product.id,
        contentType: 'WhatsApp Promotion',
        tone: 'Hype',
      },
    });
    assert.equal(badTone.status, 400);
  });

  it('rejects products from another business and ignores client businessId', async () => {
    aiProvider.setGenerateForTests(async () => 'Should not run for stolen product');

    const stolen = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      body: {
        productId: otherProduct.id,
        contentType: 'Instagram Caption',
        tone: 'Casual',
        businessId: String(other.businessId),
      },
    });
    assert.equal(stolen.status, 404);

    aiProvider.setGenerateForTests(async ({ user }) => {
      assert.match(user, /Pearl Drop Necklace/);
      return 'Fresh pearl drop for everyday glow. Shop now.';
    });

    const allowed = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      headers: { 'x-business-id': String(other.businessId) },
      body: {
        productId: product.id,
        contentType: 'Short Product Description',
        tone: 'Professional',
        businessId: String(other.businessId),
      },
    });
    assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
    assert.equal(allowed.data.product.id, product.id);
    assert.equal(allowed.data.content.includes('Fresh pearl'), true);
    assertNoSecrets(allowed.data);
  });

  it('handles missing AI configuration and provider failures safely', async () => {
    env.ai.apiKey = '';
    aiProvider.resetGenerateForTests();

    const status = await api('GET', '/api/marketing/status', { token: owner.token });
    assert.equal(status.status, 200);
    assert.equal(status.data.configured, false);
    assertNoSecrets(status.data);

    const missing = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      body: {
        productId: product.id,
        contentType: 'Instagram Caption',
        tone: 'Friendly',
      },
    });
    assert.equal(missing.status, 503);
    assert.match(missing.data.message || '', /not configured/i);
    assertNoSecrets(missing.data);

    env.ai.apiKey = 'sk-test-key-should-never-leak';
    aiProvider.setGenerateForTests(async () => {
      const err = new Error('upstream failed');
      err.statusCode = 502;
      err.message = 'The AI service could not generate content right now. Please try again.';
      throw err;
    });

    const failed = await api('POST', '/api/marketing/generate', {
      token: owner.token,
      body: {
        productId: product.id,
        contentType: 'WhatsApp Promotion',
        tone: 'Friendly',
      },
    });
    assert.equal(failed.status, 502);
    assertNoSecrets(failed.data);
    assert.equal(JSON.stringify(failed.data).includes('sk-test-key'), false);
  });
});
