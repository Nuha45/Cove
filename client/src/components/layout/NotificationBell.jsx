import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/notificationService';
import { formatOrderDate } from '../../utils/display';
import { getErrorMessage } from '../../utils/errors';

const POLL_MS = 25000;
const TOAST_MS = 5500;

function hrefFor(notification) {
  if (notification.relatedEntityType === 'order' && notification.relatedEntityId) {
    return `/orders/${notification.relatedEntityId}`;
  }
  if (notification.relatedEntityType === 'customerWant') {
    return notification.relatedEntityId
      ? `/customer-wants/${notification.relatedEntityId}`
      : '/customer-wants';
  }
  return null;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const knownIdsRef = useRef(null);
  const openRef = useRef(false);
  const toastTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  openRef.current = open;

  function clearToastTimer() {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }

  function showToast(notification) {
    clearToastTimer();
    setToast(notification);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }

  async function poll({ announce }) {
    try {
      const [listResult, countResult] = await Promise.all([
        listNotifications({ limit: 20 }),
        getUnreadNotificationCount(),
      ]);
      const notifications = listResult.notifications || [];
      const nextCount = Number(countResult.count) || 0;
      setCount(nextCount);
      if (openRef.current) {
        setItems(notifications);
      }

      const ids = notifications.map((item) => item.id);
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(ids);
        return;
      }

      if (announce) {
        const newcomers = notifications.filter((item) => !knownIdsRef.current.has(item.id));
        if (newcomers.length) {
          showToast(newcomers[0]);
        }
      }

      ids.forEach((id) => knownIdsRef.current.add(id));
    } catch {
      // Keep the last known state if polling fails.
    }
  }

  async function refreshList() {
    setLoading(true);
    setError('');
    try {
      const [listResult, countResult] = await Promise.all([
        listNotifications({ limit: 20 }),
        getUnreadNotificationCount(),
      ]);
      const notifications = listResult.notifications || [];
      setItems(notifications);
      setCount(Number(countResult.count) || 0);
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(notifications.map((item) => item.id));
      } else {
        notifications.forEach((item) => knownIdsRef.current.add(item.id));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function tick(announce) {
      if (cancelled) return;
      await poll({ announce });
    }

    tick(false);
    const intervalId = window.setInterval(() => tick(true), POLL_MS);

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        tick(true);
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      clearToastTimer();
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    refreshList();
    function onDocClick(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function openItem(notification) {
    try {
      if (!notification.isRead) {
        await markNotificationRead(notification.id);
        setItems((current) => current.map((item) => (
          item.id === notification.id ? { ...item, isRead: true } : item
        )));
        setCount((current) => Math.max(0, current - 1));
      }
    } catch {
      // Navigation still proceeds.
    }
    const href = hrefFor(notification);
    setOpen(false);
    if (href) navigate(href);
  }

  async function markAll() {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setCount(0);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function handleToastClick() {
    if (!toast) return;
    const href = hrefFor(toast);
    clearToastTimer();
    setToast(null);
    if (href) navigate(href);
    else setOpen(true);
  }

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button
        className="icon-button notification-bell"
        type="button"
        aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={19} />
        {count > 0 ? <span className="notification-badge">{count > 99 ? '99+' : count}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel" role="menu" aria-label="Notifications">
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            {count > 0 ? (
              <button className="text-button" type="button" onClick={markAll}>
                Mark all as read
              </button>
            ) : null}
          </div>
          {loading ? <p className="notification-empty">Loading...</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {!loading && !items.length ? (
            <p className="notification-empty">No notifications yet.</p>
          ) : null}
          <ul className="notification-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className={`notification-item ${item.isRead ? '' : 'unread'}`}
                  type="button"
                  onClick={() => openItem(item)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.message}</span>
                  <small>{formatOrderDate(item.createdAt)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {toast ? (
        <button
          className="notification-toast"
          type="button"
          onClick={handleToastClick}
          aria-live="polite"
        >
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
        </button>
      ) : null}
    </div>
  );
}
