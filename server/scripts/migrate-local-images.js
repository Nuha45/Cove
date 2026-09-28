/**
 * Operator-only: copy images saved on this machine's disk (server/uploads) to Cloudinary.
 *
 * Dry run by default: it only reports what it finds and changes nothing.
 * With --apply it uploads each local file that still exists, then points the record at the new
 * Cloudinary URL. Local files are never deleted. Records whose file is missing are left untouched.
 *
 * Requires MONGODB_URI and the CLOUDINARY_* variables in server/.env.
 * Run it on the machine that actually holds the files (the uploads folder is not in Git).
 *
 * Usage (from the server folder):
 *   node scripts/migrate-local-images.js
 *   node scripts/migrate-local-images.js --apply
 */
const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const LEGACY = /^\/uploads\/(products|logos|covers|payment-qr)\/([a-f0-9]{24})\/([a-f0-9-]{36})\.(jpg|png|webp)$/;
const BUSINESS_FIELDS = { logo: 'logos', storefrontCoverImage: 'covers', paymentQrImage: 'payment-qr' };

async function readLocal(value, expectedKind) {
  const match = LEGACY.exec(value || '');
  if (!match || match[1] !== expectedKind) return { status: 'unrecognised' };
  const [, kind, businessId, name, ext] = match;
  try {
    const buffer = await fs.readFile(path.join(UPLOADS_ROOT, kind, businessId, `${name}.${ext}`));
    return { status: 'found', kind, businessId, buffer, ext };
  } catch (err) {
    if (err.code === 'ENOENT') return { status: 'missing' };
    throw err;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = require('../config/env');
  const imageStorage = require('../services/imageStorage');

  if (apply && (env.imageStorage !== 'cloudinary' || !imageStorage.isConfigured())) {
    console.error(`Cloudinary is not configured. Missing: ${imageStorage.missingSettings().join(', ') || 'IMAGE_STORAGE must not be memory'}.`);
    process.exit(1);
  }

  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  const Business = require('../models/Business');
  const Product = require('../models/Product');

  const tally = { found: 0, missing: 0, unrecognised: 0, migrated: 0, skipped: 0 };

  async function handle(label, value, kind, save) {
    const local = await readLocal(value, kind);
    tally[local.status] += 1;
    console.log(`${local.status.padEnd(12)} ${label} ${value}`);
    if (!apply || local.status !== 'found') return;

    const url = await imageStorage.uploadImage({
      kind: local.kind,
      businessId: local.businessId,
      buffer: local.buffer,
      ext: local.ext,
    });
    const result = await save(url);
    if (result.modifiedCount === 1) {
      tally.migrated += 1;
      console.log(`  -> ${url}`);
    } else {
      tally.skipped += 1;
      await imageStorage.deleteImage(imageStorage.ownedPublicId(local.kind, local.businessId, url));
      console.log('  -> record changed since the scan; left as is.');
    }
  }

  await connectDB();
  try {
    const businessFilter = { $or: Object.keys(BUSINESS_FIELDS).map((field) => ({ [field]: /^\/uploads\// })) };
    for (const business of await Business.find(businessFilter).select(Object.keys(BUSINESS_FIELDS)).lean()) {
      for (const [field, kind] of Object.entries(BUSINESS_FIELDS)) {
        const value = business[field];
        if (!value || !value.startsWith('/uploads/')) continue;
        await handle(`business ${business._id} ${field}`, value, kind, (url) =>
          Business.updateOne({ _id: business._id, [field]: value }, { $set: { [field]: url } })
        );
      }
    }

    for (const product of await Product.find({ images: /^\/uploads\// }).select('images').lean()) {
      for (const value of product.images.filter((image) => image.startsWith('/uploads/'))) {
        await handle(`product ${product._id} image`, value, 'products', (url) =>
          Product.updateOne({ _id: product._id, images: value }, { $set: { 'images.$': url } })
        );
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log('');
  console.log(apply ? 'Applied.' : 'Dry run only. Nothing was uploaded or changed. Re-run with --apply to migrate.');
  console.log(`Local file found: ${tally.found}. File missing on this machine: ${tally.missing}. Unrecognised path: ${tally.unrecognised}.`);
  if (apply) console.log(`Migrated: ${tally.migrated}. Skipped: ${tally.skipped}. Local files were not deleted.`);
}

main().catch((err) => {
  console.error('migrate-local-images failed:', err.message);
  process.exit(1);
});
