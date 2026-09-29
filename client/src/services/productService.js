import api from './api';
import { downloadFile } from '../utils/download';

export function listProducts(params) {
  return api.get('/products', { params }).then((res) => res.data);
}

export function getProduct(id) {
  return api.get(`/products/${id}`).then((res) => res.data);
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

export function bulkUpdateProducts(input) {
  return api.post('/products/bulk', input).then((res) => res.data);
}

export function getInventory() {
  return api.get('/products/inventory').then((res) => res.data);
}

export function downloadProductsCsv(ids = []) {
  return downloadFile('/products/export.csv', ids.length ? { ids: ids.join(',') } : undefined, 'cove-products.csv');
}
