const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const ROOT_FOLDER = 'cove';
const KINDS = ['products', 'logos', 'covers', 'payment-qr'];
const TEST_CLOUD_NAME = 'cove-test';

// Test-only record of what the memory driver uploaded and deleted.
// failPrefixCleanup simulates a Cloudinary outage during shop cleanup.
const memory = { uploads: [], deleted: [], deletedPrefixes: [], failPrefixCleanup: false };
const MAX_PREFIX_BATCHES = 50;

let sdkConfigured = false;

function usingMemory() {
  return env.imageStorage === 'memory';
}

function cloudName() {
  if (usingMemory()) return env.cloudinary.cloudName || TEST_CLOUD_NAME;
  return env.cloudinary.cloudName;
}

function missingSettings() {
  const { cloudName: name, apiKey, apiSecret } = env.cloudinary;
  return [
    !name && 'CLOUDINARY_CLOUD_NAME',
    !apiKey && 'CLOUDINARY_API_KEY',
    !apiSecret && 'CLOUDINARY_API_SECRET',
  ].filter(Boolean);
}

function isConfigured() {
  return usingMemory() || missingSettings().length === 0;
}

function sdk() {
  const missing = missingSettings();
  if (missing.length) {
    console.error(`[images] Upload refused: missing ${missing.join(', ')} in the server environment.`);
    throw new ApiError(503, 'Image uploads are not set up on the server yet. Please try again later.');
  }
  if (!sdkConfigured) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    sdkConfigured = true;
  }
  return cloudinary;
}

function assertKind(kind) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown image kind: ${kind}`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the Cloudinary public_id when the URL is an image Cove uploaded for this business and kind.
function ownedPublicId(kind, businessId, value) {
  assertKind(kind);
  const name = cloudName();
  if (!name || typeof value !== 'string') return null;
  const pattern = new RegExp(
    `^https://res\\.cloudinary\\.com/${escapeRegex(name)}/image/upload/(?:v\\d+/)?`
    + `(${ROOT_FOLDER}/${escapeRegex(kind)}/([a-f0-9]{24})/[a-f0-9-]{36})\\.[a-z0-9]+$`
  );
  const match = pattern.exec(value);
  if (!match || match[2] !== String(businessId)) return null;
  return match[1];
}

// Uploads a validated image buffer and returns Cloudinary's secure_url.
async function uploadImage({ kind, businessId, buffer, ext }) {
  assertKind(kind);
  const publicId = `${ROOT_FOLDER}/${kind}/${businessId}/${crypto.randomUUID()}`;

  if (usingMemory()) {
    const url = `https://res.cloudinary.com/${cloudName()}/image/upload/v1/${publicId}.${ext}`;
    memory.uploads.push({ publicId, url, bytes: buffer.length });
    return url;
  }

  const client = sdk();
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const stream = client.uploader.upload_stream(
        { public_id: publicId, resource_type: 'image', overwrite: false },
        (err, response) => (err ? reject(err) : resolve(response))
      );
      stream.end(buffer);
    });
  } catch (err) {
    console.error(`[images] Cloudinary upload failed: ${err?.message || err}`);
    throw new ApiError(502, 'That image could not be uploaded right now. Please try again.');
  }

  if (!result?.secure_url || !result.secure_url.startsWith('https://')) {
    console.error('[images] Cloudinary upload returned no secure_url.');
    throw new ApiError(502, 'That image could not be uploaded right now. Please try again.');
  }
  return result.secure_url;
}

// Best effort: a failed cleanup must never block saving the record.
async function deleteImage(publicId) {
  if (!publicId) return;
  if (usingMemory()) {
    memory.deleted.push(publicId);
    return;
  }
  if (!isConfigured()) return;
  try {
    await sdk().uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (err) {
    console.warn(`[images] Could not delete ${publicId} from Cloudinary: ${err?.message || err}`);
  }
}

// Deletes every image Cove stored for one shop (cove/<kind>/<businessId>/...).
// Never throws: re-running is safe, and a failure is logged and reported, not raised.
async function deleteBusinessImages(businessId) {
  const id = String(businessId || '');
  if (!/^[a-f0-9]{24}$/.test(id)) {
    console.warn('[images] Shop image cleanup skipped: invalid business id.');
    return { ok: false, failed: [...KINDS] };
  }

  const failed = [];
  for (const kind of KINDS) {
    const prefix = `${ROOT_FOLDER}/${kind}/${id}/`;
    try {
      if (usingMemory()) {
        if (memory.failPrefixCleanup) throw new Error('simulated Cloudinary failure');
        memory.deletedPrefixes.push(prefix);
        continue;
      }
      if (!isConfigured()) throw new Error('Cloudinary is not configured');
      const client = sdk();
      for (let batch = 0; batch < MAX_PREFIX_BATCHES; batch += 1) {
        const result = await client.api.delete_resources_by_prefix(prefix, {
          resource_type: 'image',
          type: 'upload',
          invalidate: true,
        });
        if (!result?.partial) break;
      }
    } catch (err) {
      failed.push(kind);
      console.warn(`[images] Could not delete ${prefix} from Cloudinary: ${err?.message || err}`);
    }
  }
  return { ok: failed.length === 0, failed };
}

module.exports = {
  KINDS,
  isConfigured,
  missingSettings,
  ownedPublicId,
  uploadImage,
  deleteImage,
  deleteBusinessImages,
  memory,
};
