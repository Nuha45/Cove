const path = require('path');
const fs = require('fs/promises');
const ApiError = require('./ApiError');
const imageStorage = require('../services/imageStorage');
const { readImageSize } = require('./imageDimensions');

const LEGACY_ROOT = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 450 * 1024;
const MAX_EDGE_PX = 4000;
const DIMENSION_MESSAGE = `That image is too large. Please use one no bigger than ${MAX_EDGE_PX} × ${MAX_EDGE_PX} pixels.`;
const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const TYPE_MESSAGE = 'Please upload a JPG, PNG, or WebP image.';

const TYPES = {
  'image/jpeg': {
    ext: 'jpg',
    magic: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    magic: (buffer) => buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG',
  },
  'image/webp': {
    ext: 'webp',
    magic: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

// Validators accept new uploads, Cove's Cloudinary URLs, and pre-Cloudinary /uploads paths.
function isAcceptedImageValue(kind, value) {
  return typeof value === 'string' && (
    value.startsWith('data:image/')
    || value.startsWith(CLOUDINARY_PREFIX)
    || value.startsWith(`/uploads/${kind}/`)
  );
}

function createImageField({ kind, field, saveFailedMessage }) {
  function fail(message) {
    return new ApiError(400, 'Please check the form and try again.', [{ field, message }]);
  }

  // Images saved on the API server's disk before Cloudinary.
  function legacyPath(businessId, value) {
    const id = String(businessId);
    const pattern = new RegExp(`^/uploads/${kind}/([a-f0-9]{24})/([a-f0-9-]{36})\\.(jpg|png|webp)$`);
    const match = typeof value === 'string' ? pattern.exec(value) : null;
    if (!match || match[1] !== id) return null;
    return path.join(LEGACY_ROOT, kind, id, `${match[2]}.${match[3]}`);
  }

  function isOwned(businessId, value) {
    return Boolean(imageStorage.ownedPublicId(kind, businessId, value) || legacyPath(businessId, value));
  }

  function decode(dataUrl) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
    if (!match || !TYPES[match[1]]) throw fail(TYPE_MESSAGE);
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES || !TYPES[match[1]].magic(buffer)) {
      throw fail(saveFailedMessage);
    }
    const { ext } = TYPES[match[1]];
    const size = readImageSize(buffer, ext);
    if (!size) throw fail(saveFailedMessage);
    if (size.width > MAX_EDGE_PX || size.height > MAX_EDGE_PX) throw fail(DIMENSION_MESSAGE);
    return { buffer, ext };
  }

  async function store(businessId, dataUrl) {
    const { buffer, ext } = decode(dataUrl);
    return imageStorage.uploadImage({ kind, businessId: String(businessId), buffer, ext });
  }

  async function remove(businessId, value) {
    const publicId = imageStorage.ownedPublicId(kind, businessId, value);
    if (publicId) {
      await imageStorage.deleteImage(publicId);
      return;
    }
    const filePath = legacyPath(businessId, value);
    if (!filePath) return;
    await fs.unlink(filePath).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }

  // With `changes`, old files are removed only after the record saves (see createImageChanges).
  function discard(businessId, value, changes) {
    if (changes) {
      changes.afterSave(() => remove(businessId, value));
      return undefined;
    }
    return remove(businessId, value);
  }

  function trackUpload(businessId, value, changes) {
    if (changes) changes.onFailure(() => remove(businessId, value));
  }

  // Accepts an owned stored value, a new data URL, empty string to clear, or undefined to keep.
  async function saveSingle(businessId, next, previous = '', changes = null) {
    if (next === undefined) return previous || '';

    if (next === null || next === '') {
      if (previous) await discard(businessId, previous, changes);
      return '';
    }

    if (typeof next !== 'string') throw fail(TYPE_MESSAGE);
    if (next === previous || isOwned(businessId, next)) return next;
    if (!next.startsWith('data:image/')) throw fail(TYPE_MESSAGE);

    const saved = await store(businessId, next);
    trackUpload(businessId, saved, changes);
    if (previous && previous !== saved) await discard(businessId, previous, changes);
    return saved;
  }

  return { fail, isOwned, store, remove, discard, trackUpload, saveSingle };
}

// Collects file work for one record save: replaced files are deleted only after the save
// succeeds, and files uploaded for a save that fails are deleted so nothing is orphaned.
// Cleanup is best effort; a failure is logged and never changes the saved record.
function createImageChanges() {
  const afterSaveTasks = [];
  const failureTasks = [];

  async function run(tasks) {
    const pending = tasks.splice(0);
    await Promise.all(pending.map(async (task) => {
      try {
        await task();
      } catch (err) {
        console.warn(`[images] Cleanup failed: ${err?.message || err}`);
      }
    }));
  }

  return {
    afterSave(task) { afterSaveTasks.push(task); },
    onFailure(task) { failureTasks.push(task); },
    async commit() {
      failureTasks.length = 0;
      await run(afterSaveTasks);
    },
    async rollback() {
      afterSaveTasks.length = 0;
      await run(failureTasks);
    },
  };
}

module.exports = {
  createImageField,
  createImageChanges,
  isAcceptedImageValue,
  MAX_BYTES,
  MAX_EDGE_PX,
  TYPE_MESSAGE,
};
