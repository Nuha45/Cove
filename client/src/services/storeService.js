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

export function createStoreWant(slug, input) {
  return api.post(`/store/${slug}/wants`, input).then((res) => res.data);
}
