import api from './api';

export function register(payload) {
  return api.post('/auth/register', payload).then((res) => res.data);
}

export function login(payload) {
  return api.post('/auth/login', payload).then((res) => res.data);
}

export function wakeApi() {
  return api.get('/health').then(() => true, () => false);
}

export function logout() {
  return api.post('/auth/logout').then((res) => res.data);
}

export function me() {
  return api.get('/auth/me').then((res) => res.data);
}

export function forgotPassword(payload) {
  return api.post('/auth/forgot-password', payload).then((res) => res.data);
}

export function resetPassword(payload) {
  return api.post('/auth/reset-password', payload).then((res) => res.data);
}

export function verifyEmail(token) {
  return api.post('/auth/verify-email', { token }).then((res) => res.data);
}

export function resendVerification() {
  return api.post('/auth/resend-verification').then((res) => res.data);
}
