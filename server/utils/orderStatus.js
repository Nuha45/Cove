const STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const PAYMENT_STATUSES = ['Pending', 'Paid'];
const DELIVERY_METHODS = ['Pickup', 'Delivery'];

// Forward moves and cancellation only. Completed and Cancelled are final.
const TRANSITIONS = {
  New: ['Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'],
  Confirmed: ['Preparing', 'Ready', 'Completed', 'Cancelled'],
  Preparing: ['Ready', 'Completed', 'Cancelled'],
  Ready: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

function transitionMessage(from) {
  if (from === 'Completed') return 'A completed order cannot be changed.';
  if (from === 'Cancelled') return 'A cancelled order cannot be changed.';
  return 'That status change is not allowed.';
}

module.exports = {
  STATUSES,
  PAYMENT_STATUSES,
  DELIVERY_METHODS,
  TRANSITIONS,
  canTransition,
  transitionMessage,
};
