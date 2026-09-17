import api from './api';

export function getBilling() {
  return api.get('/billing').then((res) => res.data);
}

export function startSubscription() {
  return api.post('/billing/subscription', {}).then((res) => res.data);
}

export function cancelSubscription() {
  return api.post('/billing/subscription/cancel', {}).then((res) => res.data);
}
