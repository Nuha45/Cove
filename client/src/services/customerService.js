import api from './api';

export function listCustomers(params) {
  return api.get('/customers', { params }).then((res) => res.data);
}

export function getCustomer(id) {
  return api.get(`/customers/${id}`).then((res) => res.data);
}

export function updateCustomer(id, input) {
  return api.patch(`/customers/${id}`, input).then((res) => res.data);
}

export function listCustomerOrders(id, params) {
  return api.get(`/customers/${id}/orders`, { params }).then((res) => res.data);
}
