// Reads width/height from the image's own bytes (never from the client) and checks the
// container is structurally complete. Returns null for anything malformed or unsupported.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

function pngSize(buffer) {
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
  if (!buffer.subarray(buffer.length - 12).equals(PNG_IEND)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// Start-of-frame markers that carry the frame size (excludes DHT C4, JPG C8, DAC CC).
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  let size = null;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    let marker = buffer[offset + 1];
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    if (marker === 0xd9) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) return null;
    if (JPEG_SOF.has(marker)) {
      if (length < 7) return null;
      size = { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xda) {
      const scanStart = offset + 2 + length;
      if (!size || buffer.lastIndexOf(Buffer.from([0xff, 0xd9])) < scanStart) return null;
      return size;
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const riffEnd = buffer.readUInt32LE(4) + 8;
  if (riffEnd > buffer.length || riffEnd < 30) return null;
  const chunk = buffer.toString('ascii', 12, 16);
  const chunkSize = buffer.readUInt32LE(16);
  if (20 + chunkSize > riffEnd) return null;

  if (chunk === 'VP8 ') {
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null;
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    if (buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  return null;
}

const READERS = { jpg: jpegSize, png: pngSize, webp: webpSize };

function readImageSize(buffer, ext) {
  const reader = READERS[ext];
  if (!reader) return null;
  try {
    const size = reader(buffer);
    if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height)) return null;
    if (size.width < 1 || size.height < 1) return null;
    return size;
  } catch {
    return null;
  }
}

module.exports = { readImageSize };
