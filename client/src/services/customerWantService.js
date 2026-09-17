import api from './api';

export function listCustomerWants(params) {
  return api.get('/customer-wants', { params }).then((res) => res.data);
}

export function getCustomerWant(id) {
  return api.get(`/customer-wants/${id}`).then((res) => res.data);
}

export function updateCustomerWant(id, input) {
  return api.patch(`/customer-wants/${id}`, input).then((res) => res.data);
}
