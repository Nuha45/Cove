export const ORDER_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
export const PAYMENT_STATUSES = [
  'Pending',
  'Payment Pending',
  'Payment Submitted',
  'Paid',
  'Payment Rejected',
];

export const STATUS_TONE = {
  New: 'orange',
  Confirmed: 'blue',
  Preparing: 'yellow',
  Ready: 'green',
  Completed: 'green',
  Cancelled: 'red',
};

export const PAYMENT_TONE = {
  Pending: 'yellow',
  'Payment Pending': 'yellow',
  'Payment Submitted': 'blue',
  Paid: 'green',
  'Payment Rejected': 'red',
};

// Matches the server. The API still rejects anything that is not allowed.
export const NEXT_STATUSES = {
  New: ['Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
  Confirmed: ['Preparing', 'Ready', 'Completed', 'Cancelled'],
  Preparing: ['Ready', 'Completed', 'Cancelled'],
  Ready: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

export const NEXT_PAYMENT_STATUSES = {
  Pending: ['Paid', 'Payment Rejected', 'Payment Pending'],
  'Payment Pending': ['Paid', 'Payment Rejected'],
  'Payment Submitted': ['Paid', 'Payment Rejected'],
  Paid: ['Payment Pending'],
  'Payment Rejected': ['Payment Pending', 'Paid'],
};

export function itemSummary(items) {
  if (!items?.length) return 'No items';
  const first = `${items[0].name} × ${items[0].quantity}`;
  if (items.length === 1) return first;
  return `${first} + ${items.length - 1} more`;
}
