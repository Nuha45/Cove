const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const ApiError = require('./ApiError');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'products');
const MAX_BYTES = 450 * 1024;

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

function imageError(message) {
  return new ApiError(400, 'Please check the form and try again.', [
    { field: 'images', message },
  ]);
}

function ownedPath(businessId, value) {
  const id = String(businessId);
  const match = /^\/uploads\/products\/([a-f0-9]{24})\/([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(value);
  if (!match || match[1] !== id) return null;
  return path.join(UPLOAD_ROOT, id, `${match[2]}.${match[3]}`);
}

async function writeDataUrl(businessId, dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !TYPES[match[1]]) {
    throw imageError('Please upload a JPG, PNG, or WebP image.');
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES || !TYPES[match[1]].magic(buffer)) {
    throw imageError('That image could not be saved. Please try a smaller JPG, PNG, or WebP.');
  }

  const folder = path.join(UPLOAD_ROOT, String(businessId));
  await fs.mkdir(folder, { recursive: true });
  const filename = `${crypto.randomUUID()}.${TYPES[match[1]].ext}`;
  await fs.writeFile(path.join(folder, filename), buffer);
  return `/uploads/products/${businessId}/${filename}`;
}

async function removeOwnedFile(businessId, storedPath) {
  const filePath = ownedPath(businessId, storedPath);
  if (!filePath) return;
  await fs.unlink(filePath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}

// Keeps only this shop's existing files, and saves new uploads beside them.
async function saveImages(businessId, images, previous = []) {
  if (!Array.isArray(images)) {
    throw imageError('Images must be a list.');
  }
  if (images.length > 4) {
    throw imageError('You can add up to 4 images.');
  }

  const kept = [];
  const created = [];
  try {
    for (const image of images) {
      if (typeof image !== 'string' || !image.trim()) {
        throw imageError('One of the images is not valid.');
      }
      if (ownedPath(businessId, image)) {
        kept.push(image);
        continue;
      }
      if (!image.startsWith('data:image/')) {
        throw imageError('Please upload a JPG, PNG, or WebP image.');
      }
      const saved = await writeDataUrl(businessId, image);
      created.push(saved);
      kept.push(saved);
    }
  } catch (err) {
    await Promise.all(created.map((item) => removeOwnedFile(businessId, item)));
    throw err;
  }

  const removed = previous.filter((item) => !kept.includes(item));
  await Promise.all(removed.map((item) => removeOwnedFile(businessId, item)));
  return kept;
}

module.exports = { saveImages, removeOwnedFile };
