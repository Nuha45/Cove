import api from './api';

export function getStorefront(slug, params) {
  return api.get(`/store/${slug}`, { params }).then((res) => res.data);
}

export function getStoreProduct(slug, productId) {
  return api.get(`/store/${slug}/products/${productId}`).then((res) => res.data);
}

export function createStoreOrder(slug, input) {
  return api.post(`/store/${slug}/orders`, input).then((res) => res.data);
}

export function getStoreOrderConfirmation(slug, token) {
  return api.get(`/store/${slug}/orders/confirm/${encodeURIComponent(token)}`).then((res) => res.data);
}

export function submitStorePaymentReference(slug, token, input) {
  return api
    .post(`/store/${slug}/orders/confirm/${encodeURIComponent(token)}/payment`, input)
    .then((res) => res.data);
}

export function createStoreWant(slug, input) {
  return api.post(`/store/${slug}/wants`, input).then((res) => res.data);
}

export function getWantBoard(slug, params) {
  return api.get(`/store/${slug}/want-board`, { params }).then((res) => res.data);
}

export function voteWantBoard(slug, wantId) {
  return api.post(`/store/${slug}/want-board/${wantId}/votes`).then((res) => res.data);
}
