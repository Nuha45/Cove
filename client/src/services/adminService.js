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

export function archiveAdminBusiness(id) {
  return api.post(`/admin/businesses/${encodeURIComponent(id)}/archive`).then((res) => res.data);
}

export function restoreAdminBusiness(id) {
  return api.post(`/admin/businesses/${encodeURIComponent(id)}/restore`).then((res) => res.data);
}

export function setAdminBusinessOwnerAdmin(id, { grant, confirmEmail }) {
  return api
    .post(`/admin/businesses/${encodeURIComponent(id)}/platform-admin`, { grant, confirmEmail })
    .then((res) => res.data);
}

export function deleteAdminBusiness(id, confirmSlug) {
  return api
    .delete(`/admin/businesses/${encodeURIComponent(id)}`, { data: { confirmSlug } })
    .then((res) => res.data);
}
