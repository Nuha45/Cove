const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const Product = require('../models/Product');
const { signToken } = require('../services/tokenService');
const { publicAppearance } = require('../utils/storefrontAppearance');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = 'StorePlus123';
const createdBusinessIds = [];
const DAY_MS = 24 * 60 * 60 * 1000;

const INK = '#1F2937';
const SAGE = '#EDF2EC';

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
  return { status: response.status, data: text ? JSON.parse(text) : {} };
}

async function registerTenant(label) {
  const email = `storeplus-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password,
      businessName: `${label} Plus ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  const business = await Business.findById(user.businessId);
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: user.businessId, slug: business.slug };
}

async function setBasic(businessId) {
  await Subscription.updateOne(
    { businessId },
    { $set: { plan: 'pro', status: 'active', trialEndAt: new Date(Date.now() - DAY_MS) } }
  );
}

async function setPlus(businessId) {
  await Subscription.updateOne(
    { businessId },
    { $set: { plan: 'advanced', status: 'active', trialEndAt: new Date(Date.now() - DAY_MS) } }
  );
}

function saveSettings(token, body) {
  return api('PATCH', '/api/business/settings', { token, body });
}

async function publicAppearanceOf(slug) {
  const store = await api('GET', `/api/store/${slug}`);
  assert.equal(store.status, 200, JSON.stringify(store.data));
  return store.data.business;
}

describe('cove plus storefront customization', { timeout: 180000 }, () => {
  let basic;
  let plus;
  let neighbour;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    basic = await registerTenant('basic');
    plus = await registerTenant('plus');
    neighbour = await registerTenant('neighbour');
    await setBasic(basic.businessId);
    await setPlus(plus.businessId);
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const scope = { businessId: { $in: createdBusinessIds } };
      await Product.deleteMany(scope);
      await Subscription.deleteMany(scope);
      await User.deleteMany(scope);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('Basic keeps Warm, Minimal, Editorial and the six existing accents', async () => {
    for (const theme of ['warm', 'minimal', 'editorial']) {
      const saved = await saveSettings(basic.token, { storefrontTheme: theme });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.equal(saved.data.business.storefrontTheme, theme);
    }
    for (const accent of ['#FF7A3D', '#0E7490', '#3F6F5B', '#476b9b', '#8B5A2B', '#b6504a']) {
      const saved = await saveSettings(basic.token, { storefrontAccent: accent });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.equal(saved.data.business.storefrontAccent, accent);
    }
    const store = await publicAppearanceOf(basic.slug);
    assert.equal(store.appearance.theme, 'editorial');
    assert.equal(store.appearance.accent, '#b6504a');
    assert.equal(store.appearance.background, '');
  });

  it('Basic cannot save Modern, Bold, Cove Plus colors or backgrounds, even through the API', async () => {
    const before = await Business.findById(basic.businessId).lean();
    for (const body of [
      { storefrontTheme: 'modern' },
      { storefrontTheme: 'bold' },
      { storefrontAccent: INK },
      { storefrontBackground: SAGE },
      { storefrontTheme: 'warm', storefrontAccent: '#FF7A3D', storefrontBackground: SAGE },
      { storefrontTheme: 'BOLD', plan: 'advanced', advanced: true, businessId: String(plus.businessId) },
    ]) {
      const response = await saveSettings(basic.token, body);
      assert.equal(response.status, 403, JSON.stringify(body));
      assert.equal(response.data.errors[0].message, 'advanced_required');
    }
    const after = await Business.findById(basic.businessId).lean();
    assert.equal(after.storefrontTheme, before.storefrontTheme);
    assert.equal(after.storefrontAccent, before.storefrontAccent);
    assert.equal(after.storefrontBackground || '', '');

    const cleared = await saveSettings(basic.token, { storefrontBackground: '' });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
  });

  it('Cove Plus can save Modern, Bold, Cove Plus accents and backgrounds', async () => {
    const modern = await saveSettings(plus.token, { storefrontTheme: 'modern' });
    assert.equal(modern.status, 200, JSON.stringify(modern.data));
    assert.equal(modern.data.business.storefrontTheme, 'modern');

    const bold = await saveSettings(plus.token, {
      storefrontTheme: 'bold',
      storefrontAccent: INK.toLowerCase(),
      storefrontBackground: SAGE,
    });
    assert.equal(bold.status, 200, JSON.stringify(bold.data));
    assert.equal(bold.data.business.storefrontTheme, 'bold');
    assert.equal(bold.data.business.storefrontAccent, INK);
    assert.equal(bold.data.business.storefrontBackground, SAGE);

    const store = await publicAppearanceOf(plus.slug);
    assert.deepEqual(
      { theme: store.appearance.theme, accent: store.appearance.accent, background: store.appearance.background },
      { theme: 'bold', accent: INK, background: SAGE }
    );

    const untouched = await Business.findById(neighbour.businessId).lean();
    assert.equal(untouched.storefrontTheme, 'warm');
    assert.equal(untouched.storefrontBackground || '', '');
  });

  it('rejects invalid themes and colors, including CSS injection attempts', async () => {
    for (const body of [
      { storefrontTheme: 'neon' },
      { storefrontTheme: '<script>' },
      { storefrontAccent: '#123456' },
      { storefrontAccent: 'red' },
      { storefrontAccent: 'red; background:url(https://evil.test/x)' },
      { storefrontBackground: '#000000' },
      { storefrontBackground: 'url(https://evil.test/x)' },
      { storefrontBackground: { $ne: '' } },
      { storefrontBackground: 12 },
    ]) {
      const response = await saveSettings(plus.token, body);
      assert.equal(response.status, 400, JSON.stringify(body));
    }
    const stored = await Business.findById(plus.businessId).lean();
    assert.equal(stored.storefrontTheme, 'bold');
    assert.equal(stored.storefrontBackground, SAGE);
  });

  it('sanitizes stored values it does not recognise before they reach the browser', () => {
    const appearance = publicAppearance(
      { storefrontTheme: 'neon', storefrontAccent: 'red;}', storefrontBackground: 'url(x)' },
      { plus: true }
    );
    assert.equal(appearance.theme, 'warm');
    assert.equal(appearance.accent, '#FF7A3D');
    assert.equal(appearance.background, '');
  });

  it('losing Cove Plus keeps the saved look but serves a Basic look; restoring brings it back', async () => {
    const product = await Product.create({
      businessId: plus.businessId, name: 'Plus Ring', price: 300, stockQuantity: 4, category: 'Rings', status: 'Active',
    });
    const promo = await saveSettings(plus.token, {
      storefrontAnnouncement: 'Festive week',
      storefrontFeaturedProductIds: [String(product._id)],
      storefrontFeaturedCategories: ['Rings'],
    });
    assert.equal(promo.status, 200, JSON.stringify(promo.data));
    assert.equal((await publicAppearanceOf(plus.slug)).promotions.announcement, 'Festive week');

    await setBasic(plus.businessId);

    const stored = await Business.findById(plus.businessId).lean();
    assert.equal(stored.storefrontTheme, 'bold');
    assert.equal(stored.storefrontAccent, INK);
    assert.equal(stored.storefrontBackground, SAGE);
    assert.equal(stored.storefrontAnnouncement, 'Festive week');

    const downgraded = await publicAppearanceOf(plus.slug);
    assert.equal(downgraded.appearance.theme, 'warm');
    assert.equal(downgraded.appearance.accent, '#FF7A3D');
    assert.equal(downgraded.appearance.background, '');
    assert.equal(downgraded.promotions, null);
    assert.equal(JSON.stringify(downgraded).includes(SAGE), false);

    // The seller still sees their saved choices in the dashboard.
    const settings = await api('GET', '/api/business/settings', { token: plus.token });
    assert.equal(settings.data.business.storefrontTheme, 'bold');
    assert.equal(settings.data.business.storefrontBackground, SAGE);

    // A downgraded seller can still switch between the Basic themes; the saved background stays.
    const basicSave = await saveSettings(plus.token, { storefrontTheme: 'minimal', storefrontAccent: '#3F6F5B' });
    assert.equal(basicSave.status, 200, JSON.stringify(basicSave.data));
    assert.equal((await publicAppearanceOf(plus.slug)).appearance.theme, 'minimal');
    await Business.updateOne({ _id: plus.businessId }, { $set: { storefrontTheme: 'bold', storefrontAccent: INK } });

    await setPlus(plus.businessId);
    const restored = await publicAppearanceOf(plus.slug);
    assert.equal(restored.appearance.theme, 'bold');
    assert.equal(restored.appearance.accent, INK);
    assert.equal(restored.appearance.background, SAGE);
    assert.equal(restored.promotions.announcement, 'Festive week');
    assert.equal(restored.promotions.featuredProducts[0].name, 'Plus Ring');
  });

  it('an expired trial falls back the same way as a Basic downgrade', async () => {
    const trial = await registerTenant('trial');
    const saved = await saveSettings(trial.token, { storefrontTheme: 'modern', storefrontBackground: SAGE });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal((await publicAppearanceOf(trial.slug)).appearance.theme, 'modern');

    await Subscription.updateOne(
      { businessId: trial.businessId },
      { $set: { trialEndAt: new Date(Date.now() - 60 * 1000) } }
    );
    const expired = await publicAppearanceOf(trial.slug);
    assert.equal(expired.appearance.theme, 'warm');
    assert.equal(expired.appearance.background, '');
    assert.equal((await Business.findById(trial.businessId).lean()).storefrontTheme, 'modern');
  });

  it('paused and product payloads never carry Cove Plus appearance', () => {
    const doc = new Business({
      ownerId: new mongoose.Types.ObjectId(),
      name: 'Paused Plus',
      slug: `paused-plus-${stamp}`,
      category: 'Jewelry & Accessories',
      storefrontTheme: 'bold',
      storefrontAccent: INK,
      storefrontBackground: SAGE,
    });
    const paused = doc.toPausedStorefront();
    assert.equal(paused.appearance.theme, 'warm');
    assert.equal(paused.appearance.accent, '#FF7A3D');
    assert.equal(paused.appearance.background, '');
    assert.equal(doc.toStorefront().appearance.theme, 'warm');
    assert.equal(doc.toStorefront({ plus: true }).appearance.theme, 'bold');
  });
});
