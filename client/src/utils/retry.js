// The hosted API sleeps when idle. While it wakes, requests fail with 502/503, a 504 from the
// frontend proxy timing out, or a dropped/timed-out connection (common on mobile).
const TRANSIENT_STATUSES = new Set([408, 502, 503, 504]);
const TRANSIENT_CODES = new Set([
  'ERR_NETWORK',
  'ERR_NETWORK_CHANGED',
  'ECONNABORTED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ERR_TIMED_OUT',
]);

export const RETRY_DELAYS_MS = [1500, 3000];
// A signed-in seller reopening the app often hits a sleeping API; keep retrying with short waits.
export const SESSION_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 8000];

export const WAKING_MESSAGE = 'Cove is waking up. Please wait a moment…';
export const UNAVAILABLE_MESSAGE =
  'Cove is taking longer than usual to start. Please wait a few seconds and try again.';

export function isTransientError(error) {
  if (!error || error.code === 'ERR_CANCELED') return false;
  if (TRANSIENT_CODES.has(error.code)) return true;
  if (!error.response) return Boolean(error.request || error.isAxiosError);
  return TRANSIENT_STATUSES.has(error.response.status);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Runs `task`, retrying only server-unavailable failures once per entry in `delays`.
export async function withTransientRetry(task, { delays = RETRY_DELAYS_MS, onRetry } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= delays.length || !isTransientError(error)) throw error;
      onRetry?.(attempt + 1, error);
      await wait(delays[attempt]);
    }
  }
}
