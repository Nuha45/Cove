import { trackStoreEvent } from '../services/storeService';

const VISITOR_KEY = 'cove-visitor-id';

// Honour browser privacy signals: no id is created and nothing is sent.
function trackingAllowed() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.globalPrivacyControl === true) return false;
  return navigator.doNotTrack !== '1' && window.doNotTrack !== '1';
}

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Random, anonymous browser id. It is never tied to a name, email, or phone number.
function visitorId() {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9-]{16,64}$/.test(id)) {
      id = randomId();
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function seenThisSession(key) {
  try {
    const storageKey = `cove-tracked:${key}`;
    if (window.sessionStorage.getItem(storageKey)) return true;
    window.sessionStorage.setItem(storageKey, '1');
    return false;
  } catch {
    return false;
  }
}

function send(slug, type, extra = {}) {
  if (!slug || !trackingAllowed()) return;
  const id = visitorId();
  if (!id) return;
  trackStoreEvent(slug, { type, visitorId: id, ...extra }).catch(() => {});
}

export function trackVisit(slug) {
  if (seenThisSession(`visit:${slug}`)) return;
  send(slug, 'visit');
}

export function trackProductView(slug, productId) {
  if (!productId || seenThisSession(`view:${slug}:${productId}`)) return;
  send(slug, 'product_view', { productId });
}

export function trackAddToCart(slug, productId, quantity = 1) {
  if (!productId) return;
  send(slug, 'add_to_cart', { productId, quantity });
}
