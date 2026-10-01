const MAX_EDGE = 800;

export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Please choose a JPG, PNG, or WebP image.'));
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      if (dataUrl.length > 650000) {
        reject(new Error('That image is still too large. Please choose a smaller photo.'));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('We could not read that image.'));
    };
    image.src = url;
  });
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Matches the server's per-image limit (decoded bytes).
export const SERVER_IMAGE_MAX_BYTES = 450 * 1024;
export const SOURCE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const LOGO_MAX_EDGE = 512;
const QR_MAX_EDGES = [1200, 1000, 800];

export function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function checkSource(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error('Please upload a JPG, PNG, or WebP image.');
  if (file.size > SOURCE_IMAGE_MAX_BYTES) throw new Error('Please choose an image under 10 MB.');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('We could not read that image.'));
    };
    image.src = url;
  });
}

// Redrawing on a canvas drops EXIF/GPS and other metadata from the original file.
function drawScaled(image, maxEdge, { smooth = true } = {}) {
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function readOriginal(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

// Logos: longest edge 512 px. JPEGs stay JPEG; PNG/WebP keep transparency (WebP, or PNG
// where the browser cannot encode WebP). Quality steps down until it fits the server limit.
export async function prepareLogoImage(file) {
  checkSource(file);
  const canvas = drawScaled(await loadImage(file), LOGO_MAX_EDGE);
  const attempts = file.type === 'image/jpeg'
    ? [['image/jpeg', 0.85], ['image/jpeg', 0.7], ['image/jpeg', 0.55]]
    : [['image/webp', 0.9], ['image/webp', 0.75], ['image/png']];
  for (const [type, quality] of attempts) {
    const dataUrl = canvas.toDataURL(type, quality);
    if (!dataUrl.startsWith(`data:${type}`) && !dataUrl.startsWith('data:image/png')) continue;
    if (dataUrlBytes(dataUrl) <= SERVER_IMAGE_MAX_BYTES) return dataUrl;
  }
  throw new Error('That logo is still too large after resizing. Please choose a simpler image.');
}

// QR codes are always saved as lossless PNG (never JPEG) so module edges stay crisp.
// Large sources are scaled to at most 1200 px; if no PNG fits, a small original is kept as-is.
export async function prepareQrImage(file) {
  checkSource(file);
  const image = await loadImage(file);
  for (const edge of QR_MAX_EDGES) {
    const scaling = Math.max(image.width, image.height) > edge;
    const dataUrl = drawScaled(image, edge, { smooth: scaling }).toDataURL('image/png');
    if (dataUrl.startsWith('data:image/png') && dataUrlBytes(dataUrl) <= SERVER_IMAGE_MAX_BYTES) return dataUrl;
  }
  if (file.size <= SERVER_IMAGE_MAX_BYTES) return readOriginal(file);
  throw new Error('That QR image is too large. Please crop it closer to the code and try again.');
}
