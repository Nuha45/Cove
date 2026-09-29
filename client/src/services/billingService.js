import api from './api';

export function getBilling() {
  return api.get('/billing').then((res) => res.data);
}

// Only the plan key is sent. Price and Razorpay plan ids are decided on the server.
export function startSubscription(plan = 'pro') {
  return api.post('/billing/subscription', { plan }).then((res) => res.data);
}

export function cancelSubscription() {
  return api.post('/billing/subscription/cancel', {}).then((res) => res.data);
}
