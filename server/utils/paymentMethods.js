const PAYMENT_METHODS = ['qr', 'payment_link', 'instructions', 'pay_on_pickup', 'cash_on_delivery'];

// Legacy "Pending" remains valid for existing orders. New orders use "Payment Pending".
const PAYMENT_STATUSES = [
  'Pending',
  'Payment Pending',
  'Payment Submitted',
  'Paid',
  'Payment Rejected',
];

const OPEN_PAYMENT_STATUSES = ['Pending', 'Payment Pending', 'Payment Submitted'];

const SELLER_PAYMENT_TRANSITIONS = {
  Pending: ['Paid', 'Payment Rejected', 'Payment Pending'],
  'Payment Pending': ['Paid', 'Payment Rejected'],
  'Payment Submitted': ['Paid', 'Payment Rejected'],
  Paid: ['Payment Pending'],
  'Payment Rejected': ['Payment Pending', 'Paid'],
};

const CUSTOMER_PAYMENT_TRANSITIONS = {
  Pending: ['Payment Submitted'],
  'Payment Pending': ['Payment Submitted'],
};

function isOpenPaymentStatus(status) {
  return OPEN_PAYMENT_STATUSES.includes(status);
}

function canSellerSetPayment(from, to) {
  return Boolean(SELLER_PAYMENT_TRANSITIONS[from]?.includes(to));
}

function canCustomerSetPayment(from, to) {
  return Boolean(CUSTOMER_PAYMENT_TRANSITIONS[from]?.includes(to));
}

function paymentTransitionMessage(from) {
  if (from === 'Paid') return 'That payment change is not allowed from Paid.';
  return 'That payment status change is not allowed.';
}

function normalizePaymentMethod(value) {
  const method = String(value || '').trim();
  if (!method) return '';
  return PAYMENT_METHODS.includes(method) ? method : null;
}

function methodLabel(method, currency = 'INR') {
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
    case 'cash_on_delivery':
      return 'Cash on delivery';
    default:
      return 'Payment';
  }
}

module.exports = {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  OPEN_PAYMENT_STATUSES,
  SELLER_PAYMENT_TRANSITIONS,
  CUSTOMER_PAYMENT_TRANSITIONS,
  isOpenPaymentStatus,
  canSellerSetPayment,
  canCustomerSetPayment,
  paymentTransitionMessage,
  normalizePaymentMethod,
  methodLabel,
};
