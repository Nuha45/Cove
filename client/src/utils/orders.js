export const ORDER_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
export const PAYMENT_STATUSES = ['Pending', 'Paid'];

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
  Paid: 'green',
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

export function itemSummary(items) {
  if (!items?.length) return 'No items';
  const first = `${items[0].name} × ${items[0].quantity}`;
  if (items.length === 1) return first;
  return `${first} + ${items.length - 1} more`;
}
