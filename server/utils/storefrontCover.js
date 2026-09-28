const { createImageField } = require('./imageUpload');

const cover = createImageField({
  kind: 'covers',
  field: 'storefrontCoverImage',
  saveFailedMessage: 'That cover image could not be saved. Please try a smaller JPG, PNG, or WebP.',
});

module.exports = { saveStorefrontCover: cover.saveSingle, removeOwnedFile: cover.remove };
