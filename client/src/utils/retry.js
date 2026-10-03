// The hosted API sleeps when idle; while it wakes, requests fail with 502/503 or never connect.
const TRANSIENT_STATUSES = new Set([502, 503]);

export const RETRY_DELAYS_MS = [1500, 3000];
// Restoring a saved session runs without user input, so it can wait a little longer for the API.
export const SESSION_RETRY_DELAYS_MS = [1500, 3000, 6000];

export const WAKING_MESSAGE = 'Cove is waking up. Please wait a moment…';
export const UNAVAILABLE_MESSAGE =
  'Cove is taking longer than usual to start. Please wait a few seconds and try again.';

export function isTransientError(error) {
  if (!error || error.code === 'ERR_CANCELED') return false;
  if (!error.response) return Boolean(error.request || error.isAxiosError || error.code === 'ERR_NETWORK');
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
