import api from './api';

export function listProducts(params) {
  return api.get('/products', { params }).then((res) => res.data);
}

export function createProduct(input) {
  return api.post('/products', input).then((res) => res.data);
}

export function updateProduct(id, input) {
  return api.patch(`/products/${id}`, input).then((res) => res.data);
}

export function archiveProduct(id) {
  return api.delete(`/products/${id}`).then((res) => res.data);
}
