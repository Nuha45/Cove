import api from './api';

export function getMarketingStatus() {
  return api.get('/marketing/status').then((res) => res.data);
}

export function generateMarketing(input) {
  return api.post('/marketing/generate', input).then((res) => res.data);
}
