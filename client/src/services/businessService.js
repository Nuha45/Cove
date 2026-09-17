import api from './api';

export function getBusinessSettings() {
  return api.get('/business/settings').then((res) => res.data);
}

export function updateBusinessSettings(input) {
  return api.patch('/business/settings', input).then((res) => res.data);
}
