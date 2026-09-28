const { createImageField } = require('./imageUpload');

const logo = createImageField({
  kind: 'logos',
  field: 'logo',
  saveFailedMessage: 'That logo could not be saved. Please try a smaller JPG, PNG, or WebP.',
});

module.exports = { saveLogo: logo.saveSingle, removeOwnedFile: logo.remove };
