import api from './api';

export function listOrders(params) {
  return api.get('/orders', { params }).then((res) => res.data);
}

export function getOrder(id) {
  return api.get(`/orders/${id}`).then((res) => res.data);
}

export function createOrder(input) {
  return api.post('/orders', input).then((res) => res.data);
}

export function updateOrder(id, input) {
  return api.patch(`/orders/${id}`, input).then((res) => res.data);
}
