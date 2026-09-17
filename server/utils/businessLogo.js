const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const ApiError = require('./ApiError');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'logos');
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

function logoError(message) {
  return new ApiError(400, 'Please check the form and try again.', [
    { field: 'logo', message },
  ]);
}

function ownedPath(businessId, value) {
  const id = String(businessId);
  const match = /^\/uploads\/logos\/([a-f0-9]{24})\/([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(value);
  if (!match || match[1] !== id) return null;
  return path.join(UPLOAD_ROOT, id, `${match[2]}.${match[3]}`);
}

async function writeDataUrl(businessId, dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !TYPES[match[1]]) {
    throw logoError('Please upload a JPG, PNG, or WebP image.');
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES || !TYPES[match[1]].magic(buffer)) {
    throw logoError('That logo could not be saved. Please try a smaller JPG, PNG, or WebP.');
  }

  const folder = path.join(UPLOAD_ROOT, String(businessId));
  await fs.mkdir(folder, { recursive: true });
  const filename = `${crypto.randomUUID()}.${TYPES[match[1]].ext}`;
  await fs.writeFile(path.join(folder, filename), buffer);
  return `/uploads/logos/${businessId}/${filename}`;
}

async function removeOwnedFile(businessId, storedPath) {
  const filePath = ownedPath(businessId, storedPath);
  if (!filePath) return;
  await fs.unlink(filePath).catch((err) => {
    if (err.code !== 'ENOENT') throw err;
  });
}

// Accepts existing owned path, a new data URL, empty string to clear, or undefined to keep.
async function saveLogo(businessId, nextLogo, previous = '') {
  if (nextLogo === undefined) return previous || '';

  if (nextLogo === null || nextLogo === '') {
    if (previous) await removeOwnedFile(businessId, previous);
    return '';
  }

  if (typeof nextLogo !== 'string') {
    throw logoError('Please upload a JPG, PNG, or WebP image.');
  }

  if (ownedPath(businessId, nextLogo)) {
    return nextLogo;
  }

  if (!nextLogo.startsWith('data:image/')) {
    throw logoError('Please upload a JPG, PNG, or WebP image.');
  }

  const saved = await writeDataUrl(businessId, nextLogo);
  if (previous && previous !== saved) {
    await removeOwnedFile(businessId, previous);
  }
  return saved;
}

module.exports = { saveLogo, removeOwnedFile };
