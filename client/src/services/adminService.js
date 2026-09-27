import api from './api';

export function getAdminOverview() {
  return api.get('/admin/overview').then((res) => res.data);
}

export function listAdminBusinesses(params) {
  return api.get('/admin/businesses', { params }).then((res) => res.data);
}

export function getAdminBusiness(id) {
  return api.get(`/admin/businesses/${encodeURIComponent(id)}`).then((res) => res.data);
}
