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

export function formatPrice(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '₹0';
  const whole = Math.abs(value - Math.round(value)) < 0.001;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
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
