const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { connectTestDB } = require('./_testDb');
const env = require('../config/env');
const app = require('../app');
const User = require('../models/User');
const Business = require('../models/Business');
const Product = require('../models/Product');
const Subscription = require('../models/Subscription');
const Notification = require('../models/Notification');
const AdminAction = require('../models/AdminAction');
const zlib = require('zlib');
const imageStorage = require('../services/imageStorage');
const adminService = require('../services/adminService');
const { signToken } = require('../services/tokenService');
const { MAX_BYTES } = require('../utils/imageUpload');

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createdBusinessIds = [];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/cove\//;

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
  const email = `images-${label}-${stamp}@example.com`;
  const registered = await api('POST', '/api/auth/register', {
    body: {
      name: `${label} Owner`,
      email,
      password: 'ImagesTest123',
      businessName: `${label} Images ${stamp.slice(-6)}`,
      category: 'Jewelry & Accessories',
      phone: '9876543210',
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const user = await User.findOneAndUpdate({ email }, { $set: { emailVerified: true } }, { new: true });
  createdBusinessIds.push(user.businessId);
  return { token: signToken(user), businessId: String(user.businessId) };
}

function publicIdOf(url) {
  return /\/image\/upload\/v\d+\/(.+)\.[a-z0-9]+$/.exec(url)[1];
}

describe('Cloudinary image storage', { timeout: 120000 }, () => {
  let seller;
  let other;

  before(async () => {
    await connectTestDB();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    seller = await registerTenant('seller');
    other = await registerTenant('other');
  });

  after(async () => {
    if (createdBusinessIds.length) {
      const filter = { businessId: { $in: createdBusinessIds } };
      await Product.deleteMany(filter);
      await Notification.deleteMany(filter);
      await Subscription.deleteMany(filter);
      await AdminAction.deleteMany(filter);
      await User.deleteMany(filter);
      await Business.deleteMany({ _id: { $in: createdBusinessIds } });
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  it('uploads product images and stores the secure URL', async () => {
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Cloud Ring', price: 100, stockQuantity: 3, status: 'Active', images: [PNG] },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const [url] = created.data.product.images;
    assert.match(url, CLOUDINARY_URL);
    assert.ok(url.includes(`/cove/products/${seller.businessId}/`));

    const stored = await Product.findById(created.data.product.id).lean();
    assert.deepEqual(stored.images, [url]);
  });

  it('keeps, replaces, and removes product images without breaking the record', async () => {
    const created = await api('POST', '/api/products', {
      token: seller.token,
      body: { name: 'Swap Ring', price: 100, stockQuantity: 3, images: [PNG, PNG] },
    });
    const [first, second] = created.data.product.images;
    const productId = created.data.product.id;

    const replaced = await api('PATCH', `/api/products/${productId}`, {
      token: seller.token,
      body: { images: [first, PNG] },
    });
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data));
    assert.equal(replaced.data.product.images[0], first);
    assert.notEqual(replaced.data.product.images[1], second);
    assert.ok(imageStorage.memory.deleted.includes(publicIdOf(second)));

    const cleared = await api('PATCH', `/api/products/${productId}`, {
      token: seller.token,
      body: { images: [] },
    });
    assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
    assert.deepEqual(cleared.data.product.images, []);
    assert.ok(imageStorage.memory.deleted.includes(publicIdOf(first)));
  });

  it('keeps legacy /uploads paths on existing records', async () => {
    const legacy = `/uploads/products/${seller.businessId}/11111111-2222-4333-8444-555555555555.jpg`;
    const product = await Product.create({
      businessId: seller.businessId,
      name: 'Legacy Ring',
      price: 100,
      stockQuantity: 1,
      images: [legacy],
    });

    const updated = await api('PATCH', `/api/products/${product.id}`, {
      token: seller.token,
      body: { images: [legacy, PNG] },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.product.images[0], legacy);
    assert.match(updated.data.product.images[1], CLOUDINARY_URL);
  });

  it('rejects image URLs that Cove did not upload for this shop', async () => {
    const foreign = await api('POST', '/api/products', {
      token: other.token,
      body: { name: 'Other Ring', price: 100, stockQuantity: 1, images: [PNG] },
    });
    const otherUrl = foreign.data.product.images[0];

    for (const images of [[otherUrl], ['https://evil.example/ring.png'], ['https://res.cloudinary.com/someone-else/image/upload/v1/x.png']]) {
      const response = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Stolen Ring', price: 100, stockQuantity: 1, images },
      });
      assert.equal(response.status, 400, images[0]);
    }

    const logo = await api('PATCH', '/api/business/settings', {
      token: seller.token,
      body: { logo: 'https://evil.example/logo.png' },
    });
    assert.equal(logo.status, 400);
  });

  for (const { field, kind } of [
    { field: 'logo', kind: 'logos' },
    { field: 'storefrontCoverImage', kind: 'covers' },
    { field: 'paymentQrImage', kind: 'payment-qr' },
  ]) {
    it(`uploads, replaces, and clears the ${field}`, async () => {
      const first = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: PNG } });
      assert.equal(first.status, 200, JSON.stringify(first.data));
      const firstUrl = first.data.business[field];
      assert.match(firstUrl, CLOUDINARY_URL);
      assert.ok(firstUrl.includes(`/cove/${kind}/${seller.businessId}/`));
      assert.equal((await Business.findById(seller.businessId).lean())[field], firstUrl);

      const kept = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: firstUrl } });
      assert.equal(kept.data.business[field], firstUrl);

      const second = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: PNG } });
      const secondUrl = second.data.business[field];
      assert.notEqual(secondUrl, firstUrl);
      assert.ok(imageStorage.memory.deleted.includes(publicIdOf(firstUrl)));

      const cleared = await api('PATCH', '/api/business/settings', { token: seller.token, body: { [field]: '' } });
      assert.equal(cleared.status, 200, JSON.stringify(cleared.data));
      assert.equal(cleared.data.business[field], '');
      assert.ok(imageStorage.memory.deleted.includes(publicIdOf(secondUrl)));
    });
  }

  it('refuses uploads with a clear error when Cloudinary is not configured', async () => {
    const saved = { storage: env.imageStorage, cloudinary: { ...env.cloudinary } };
    env.imageStorage = 'cloudinary';
    env.cloudinary.cloudName = '';
    env.cloudinary.apiKey = '';
    env.cloudinary.apiSecret = '';
    const originalError = console.error;
    console.error = () => {};
    try {
      const before = (await Business.findById(seller.businessId).lean()).logo;
      const response = await api('PATCH', '/api/business/settings', { token: seller.token, body: { logo: PNG } });
      assert.equal(response.status, 503);
      assert.match(response.data.message, /not set up/i);
      assert.equal((await Business.findById(seller.businessId).lean()).logo, before);
    } finally {
      console.error = originalError;
      env.imageStorage = saved.storage;
      Object.assign(env.cloudinary, saved.cloudinary);
    }
  });

  describe('validation', () => {
    async function productWith(image) {
      return api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Check Ring', price: 100, stockQuantity: 1, images: [image] },
      });
    }

    it('accepts valid PNG, JPEG and WebP images up to 4000 px', async () => {
      for (const image of [pngDataUrl(4000, 1), pngDataUrl(1, 4000), jpegDataUrl(4000, 3000), webpDataUrl(4000, 4000)]) {
        const response = await productWith(image);
        assert.equal(response.status, 201, JSON.stringify(response.data));
        assert.match(response.data.product.images[0], CLOUDINARY_URL);
      }
    });

    it('rejects images wider or taller than 4000 px for every upload type', async () => {
      for (const image of [pngDataUrl(4001, 1), pngDataUrl(1, 4001), jpegDataUrl(3000, 4001), webpDataUrl(4001, 10)]) {
        const response = await productWith(image);
        assert.equal(response.status, 400, image.slice(0, 30));
        assert.match(JSON.stringify(response.data.errors), /4000/);
      }
      for (const field of ['logo', 'storefrontCoverImage', 'paymentQrImage']) {
        const response = await api('PATCH', '/api/business/settings', {
          token: seller.token,
          body: { [field]: pngDataUrl(5000, 5000) },
        });
        assert.equal(response.status, 400, field);
      }
    });

    it('enforces the 450 KB limit', async () => {
      const oversized = Buffer.concat([pngBuffer(10, 10), Buffer.alloc(MAX_BYTES)]);
      const response = await productWith(`data:image/png;base64,${oversized.toString('base64')}`);
      assert.equal(response.status, 400);
      const logo = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: { logo: `data:image/png;base64,${oversized.toString('base64')}` },
      });
      assert.equal(logo.status, 400);
    });

    it('rejects SVG, GIF, mismatched types and malformed images', async () => {
      const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
      const gif = `data:image/gif;base64,${Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;').toString('base64')}`;
      const jpegAsPng = `data:image/png;base64,${jpegBuffer(10, 10).toString('base64')}`;
      const truncatedPng = `data:image/png;base64,${pngBuffer(10, 10).subarray(0, 40).toString('base64')}`;
      const headerOnlyJpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]).toString('base64')}`;
      for (const image of [svg, gif, jpegAsPng, truncatedPng, headerOnlyJpeg]) {
        const response = await productWith(image);
        assert.equal(response.status, 400, image.slice(0, 40));
      }
      const coverSvg = await api('PATCH', '/api/business/settings', {
        token: seller.token,
        body: { storefrontCoverImage: svg },
      });
      assert.equal(coverSvg.status, 400);
    });
  });

  describe('replacement ordering', () => {
    function failNextSave(Model) {
      const original = Model.prototype.save;
      Model.prototype.save = function failingSave() {
        Model.prototype.save = original;
        return Promise.reject(new Error('simulated save failure'));
      };
      return () => { Model.prototype.save = original; };
    }

    async function quietly(fn) {
      const originalError = console.error;
      console.error = () => {};
      try {
        return await fn();
      } finally {
        console.error = originalError;
      }
    }

    it('keeps the old product image when the product save fails, and removes the new upload', async () => {
      const created = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Order Ring', price: 100, stockQuantity: 1, images: [PNG] },
      });
      const [oldUrl] = created.data.product.images;
      const restore = failNextSave(Product);
      const uploadsBefore = imageStorage.memory.uploads.length;
      try {
        const response = await quietly(() => api('PATCH', `/api/products/${created.data.product.id}`, {
          token: seller.token,
          body: { images: [PNG] },
        }));
        assert.equal(response.status, 500);
      } finally {
        restore();
      }

      assert.equal(imageStorage.memory.deleted.includes(publicIdOf(oldUrl)), false);
      assert.deepEqual((await Product.findById(created.data.product.id).lean()).images, [oldUrl]);
      const newUpload = imageStorage.memory.uploads[uploadsBefore];
      assert.ok(newUpload, 'the replacement was uploaded');
      assert.ok(imageStorage.memory.deleted.includes(newUpload.publicId), 'orphaned upload is removed');
    });

    it('keeps the old logo when the settings save fails', async () => {
      const first = await api('PATCH', '/api/business/settings', { token: seller.token, body: { logo: PNG } });
      const oldUrl = first.data.business.logo;
      const restore = failNextSave(Business);
      try {
        const response = await quietly(() => api('PATCH', '/api/business/settings', {
          token: seller.token,
          body: { logo: PNG },
        }));
        assert.equal(response.status, 500);
      } finally {
        restore();
      }
      assert.equal(imageStorage.memory.deleted.includes(publicIdOf(oldUrl)), false);
      assert.equal((await Business.findById(seller.businessId).lean()).logo, oldUrl);
    });

    it('deletes the old image only after a successful save, and keeps the new image if cleanup fails', async () => {
      const created = await api('POST', '/api/products', {
        token: seller.token,
        body: { name: 'Cleanup Ring', price: 100, stockQuantity: 1, images: [PNG] },
      });
      const [oldUrl] = created.data.product.images;

      const replaced = await api('PATCH', `/api/products/${created.data.product.id}`, {
        token: seller.token,
        body: { images: [PNG] },
      });
      assert.equal(replaced.status, 200);
      assert.ok(imageStorage.memory.deleted.includes(publicIdOf(oldUrl)));
      const [secondUrl] = replaced.data.product.images;

      const originalDelete = imageStorage.deleteImage;
      const originalWarn = console.warn;
      imageStorage.deleteImage = async () => { throw new Error('simulated Cloudinary outage'); };
      console.warn = () => {};
      try {
        const again = await api('PATCH', `/api/products/${created.data.product.id}`, {
          token: seller.token,
          body: { images: [PNG] },
        });
        assert.equal(again.status, 200, JSON.stringify(again.data));
        const [thirdUrl] = again.data.product.images;
        assert.notEqual(thirdUrl, secondUrl);
        assert.deepEqual((await Product.findById(created.data.product.id).lean()).images, [thirdUrl]);
      } finally {
        imageStorage.deleteImage = originalDelete;
        console.warn = originalWarn;
      }
    });
  });

  describe('shop deletion cleanup', () => {
    const operator = { _id: new mongoose.Types.ObjectId(), email: 'operator@example.com', businessId: null };

    async function archivedTenant(label) {
      const tenant = await registerTenant(label);
      const logo = await api('PATCH', '/api/business/settings', { token: tenant.token, body: { logo: PNG } });
      assert.equal(logo.status, 200, JSON.stringify(logo.data));
      const business = await Business.findById(tenant.businessId);
      business.archivedAt = new Date();
      await business.save();
      return { ...tenant, slug: business.slug };
    }

    it("deletes all four of the shop's Cloudinary folders and nothing else", async () => {
      const tenant = await archivedTenant('cleanup');
      const before = imageStorage.memory.deletedPrefixes.length;

      const result = await adminService.deleteBusiness(tenant.businessId, operator, { confirmSlug: tenant.slug });
      assert.equal(result.id, tenant.businessId);

      const prefixes = imageStorage.memory.deletedPrefixes.slice(before);
      assert.deepEqual(prefixes.sort(), [
        `cove/covers/${tenant.businessId}/`,
        `cove/logos/${tenant.businessId}/`,
        `cove/payment-qr/${tenant.businessId}/`,
        `cove/products/${tenant.businessId}/`,
      ]);
      assert.equal(prefixes.some((prefix) => prefix.includes(seller.businessId)), false);
      assert.equal(await Business.exists({ _id: tenant.businessId }), null);

      const rerun = await imageStorage.deleteBusinessImages(tenant.businessId);
      assert.equal(rerun.ok, true, 'cleanup is safe to repeat');
      assert.equal((await imageStorage.deleteBusinessImages('not-an-id')).ok, false);
    });

    it('still deletes the shop when Cloudinary cleanup fails', async () => {
      const tenant = await archivedTenant('cleanupfail');
      const originalWarn = console.warn;
      const warnings = [];
      console.warn = (...args) => warnings.push(args.join(' '));
      imageStorage.memory.failPrefixCleanup = true;
      try {
        const result = await adminService.deleteBusiness(tenant.businessId, operator, { confirmSlug: tenant.slug });
        assert.equal(result.id, tenant.businessId);
      } finally {
        imageStorage.memory.failPrefixCleanup = false;
        console.warn = originalWarn;
      }
      assert.equal(await Business.exists({ _id: tenant.businessId }), null);
      assert.equal(await User.exists({ businessId: tenant.businessId }), null);
      assert.ok(warnings.some((line) => line.includes(`cove/products/${tenant.businessId}/`)));
      assert.equal(warnings.some((line) => /api_secret|CLOUDINARY_API_SECRET/i.test(line)), false);
    });
  });
});

// Real PNG files (valid CRCs and zlib data), sized as requested.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function pngBuffer(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  const rows = Buffer.alloc((width + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngDataUrl(width, height) {
  return `data:image/png;base64,${pngBuffer(width, height).toString('base64')}`;
}

// Structurally complete baseline JPEG container (SOI, SOF0, SOS, scan data, EOI).
function jpegBuffer(width, height) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, sos, Buffer.from([0x12, 0x34, 0x56]), Buffer.from([0xff, 0xd9])]);
}

function jpegDataUrl(width, height) {
  return `data:image/jpeg;base64,${jpegBuffer(width, height).toString('base64')}`;
}

// Lossless WebP (VP8L) header with the requested size.
function webpDataUrl(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(22, 4);
  buffer.write('WEBP', 8, 'ascii');
  buffer.write('VP8L', 12, 'ascii');
  buffer.writeUInt32LE(10, 16);
  buffer[20] = 0x2f;
  buffer.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 21);
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}
