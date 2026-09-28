const { createImageField } = require('./imageUpload');

const qr = createImageField({
  kind: 'payment-qr',
  field: 'paymentQrImage',
  saveFailedMessage: 'That QR image could not be saved. Please try a smaller JPG, PNG, or WebP.',
});

module.exports = { savePaymentQr: qr.saveSingle, removeOwnedFile: qr.remove };
