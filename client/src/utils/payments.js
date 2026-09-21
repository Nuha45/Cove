export const PAYMENT_METHODS = ['qr', 'payment_link', 'instructions', 'pay_on_pickup'];

export function paymentMethodLabel(method, currency = 'INR') {
  const india = currency === 'INR';
  switch (method) {
    case 'qr':
      return india ? 'UPI / QR code' : 'QR code';
    case 'payment_link':
      return india ? 'UPI / payment link' : 'Payment link';
    case 'instructions':
      return 'Payment instructions';
    case 'pay_on_pickup':
      return 'Pay on pickup';
    default:
      return 'Not selected';
  }
}

export function enabledCheckoutMethods(payments, deliveryMethod, currency = 'INR') {
  if (!payments) return [];
  const options = [];
  if (payments.qrEnabled) {
    options.push({ value: 'qr', label: paymentMethodLabel('qr', currency) });
  }
  if (payments.linkEnabled) {
    options.push({ value: 'payment_link', label: paymentMethodLabel('payment_link', currency) });
  }
  if (payments.instructionsEnabled) {
    options.push({ value: 'instructions', label: paymentMethodLabel('instructions', currency) });
  }
  if (payments.payOnPickupEnabled && deliveryMethod !== 'Delivery') {
    options.push({ value: 'pay_on_pickup', label: paymentMethodLabel('pay_on_pickup', currency) });
  }
  return options;
}
