export function appOrigin() {
  const configured = import.meta.env.VITE_APP_ORIGIN;
  if (configured) return String(configured).replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function storefrontPath(slug) {
  return `/store/${slug}`;
}

export function storefrontUrl(slug) {
  if (!slug) return '';
  return `${appOrigin()}${storefrontPath(slug)}`;
}

export async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.left = '-9999px';
  document.body.appendChild(field);
  field.select();
  document.execCommand('copy');
  document.body.removeChild(field);
}

function confirmationKey(slug, orderNumber) {
  return `cove-order:${slug}:${orderNumber}`;
}

export function saveConfirmation(slug, result) {
  const payload = JSON.stringify(result);
  window.sessionStorage.setItem(confirmationKey(slug, result.order.orderNumber), payload);
  window.sessionStorage.setItem(`cove-last-order:${slug}`, payload);
}

export function loadConfirmation(slug, orderNumber) {
  try {
    const exact = window.sessionStorage.getItem(confirmationKey(slug, orderNumber));
    if (exact) return JSON.parse(exact);
    const latest = window.sessionStorage.getItem(`cove-last-order:${slug}`);
    if (!latest) return null;
    const parsed = JSON.parse(latest);
    if (parsed?.order?.orderNumber === orderNumber) return parsed;
    return null;
  } catch {
    return null;
  }
}
