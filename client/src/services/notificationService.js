import api from './api';

export function listNotifications(params) {
  return api.get('/notifications', { params }).then((res) => res.data);
}

export function getUnreadNotificationCount() {
  return api.get('/notifications/unread-count').then((res) => res.data);
}

export function markNotificationRead(id) {
  return api.patch(`/notifications/${id}/read`).then((res) => res.data);
}

export function markAllNotificationsRead() {
  return api.patch('/notifications/read-all').then((res) => res.data);
}
