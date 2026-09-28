const { createImageField, TYPE_MESSAGE } = require('./imageUpload');

const productImage = createImageField({
  kind: 'products',
  field: 'images',
  saveFailedMessage: 'That image could not be saved. Please try a smaller JPG, PNG, or WebP.',
});

// Keeps only this shop's existing images, and uploads new ones beside them.
async function saveImages(businessId, images, previous = []) {
  if (!Array.isArray(images)) {
    throw productImage.fail('Images must be a list.');
  }
  if (images.length > 4) {
    throw productImage.fail('You can add up to 4 images.');
  }

  const kept = [];
  const created = [];
  try {
    for (const image of images) {
      if (typeof image !== 'string' || !image.trim()) {
        throw productImage.fail('One of the images is not valid.');
      }
      if (previous.includes(image) || productImage.isOwned(businessId, image)) {
        kept.push(image);
        continue;
      }
      if (!image.startsWith('data:image/')) {
        throw productImage.fail(TYPE_MESSAGE);
      }
      const saved = await productImage.store(businessId, image);
      created.push(saved);
      kept.push(saved);
    }
  } catch (err) {
    await Promise.all(created.map((item) => productImage.remove(businessId, item)));
    throw err;
  }

  const removed = previous.filter((item) => !kept.includes(item));
  await Promise.all(removed.map((item) => productImage.remove(businessId, item)));
  return kept;
}

module.exports = { saveImages, removeOwnedFile: productImage.remove };
