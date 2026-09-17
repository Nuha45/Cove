import api from './api';

export function getAnalytics() {
  return api.get('/analytics').then((res) => res.data);
}
