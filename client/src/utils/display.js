export function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
}

export function formatEyebrowDate(date = new Date()) {
  return date
    .toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();
}

// The signed-in shop's currency, used when a dashboard page does not pass one explicitly.
// Storefront pages always pass the shop's currency themselves.
let defaultCurrency = 'INR';

export function setDefaultCurrency(currency) {
  defaultCurrency = currency || 'INR';
}

export function getDefaultCurrency() {
  return defaultCurrency;
}

export function formatPrice(amount, currency = defaultCurrency) {
  const value = Number(amount);
  const code = currency || defaultCurrency;
  if (!Number.isFinite(value)) {
    try {
      return new Intl.NumberFormat('en', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(0);
    } catch {
      return '0';
    }
  }
  const whole = Math.abs(value - Math.round(value)) < 0.001;
  const locale = code === 'INR' ? 'en-IN' : 'en';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(whole ? 0 : 2)}`;
  }
}

export function formatOrderDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatUpdated(iso) {
  if (!iso) return 'Just added';
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60 * 1000;
  if (diff < minute) return 'Updated just now';
  if (diff < 60 * minute) {
    const minutes = Math.floor(diff / minute);
    return `Updated ${minutes} min ago`;
  }
  const hours = Math.floor(diff / (60 * minute));
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
  return `Updated ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

export function initials(name, count = 2) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, count)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
