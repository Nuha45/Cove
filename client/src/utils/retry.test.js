import { describe, expect, it, vi } from 'vitest';
import { isTransientError, withTransientRetry } from './retry';

const withStatus = (status) => Object.assign(new Error(String(status)), { isAxiosError: true, response: { status } });

describe('isTransientError', () => {
  it('treats 502, 503, 504, timeouts and network failures as transient', () => {
    expect(isTransientError(withStatus(408))).toBe(true);
    expect(isTransientError(withStatus(502))).toBe(true);
    expect(isTransientError(withStatus(503))).toBe(true);
    expect(isTransientError(withStatus(504))).toBe(true);
    expect(isTransientError(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', request: {} }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('timeout'), { code: 'ECONNABORTED', request: {} }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe(true);
  });

  it('does not treat permanent, cancelled or non-HTTP errors as transient', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 429, 500]) {
      expect(isTransientError(withStatus(status)), String(status)).toBe(false);
    }
    expect(isTransientError(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED', request: {} }))).toBe(false);
    expect(isTransientError(new TypeError('bug'))).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe('withTransientRetry', () => {
  it('stops after the configured number of retries', async () => {
    const task = vi.fn().mockRejectedValue(withStatus(503));
    const onRetry = vi.fn();
    await expect(withTransientRetry(task, { delays: [0, 0], onRetry })).rejects.toMatchObject({ response: { status: 503 } });
    expect(task).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2]);
  });

  it('returns the first successful result', async () => {
    const task = vi.fn().mockRejectedValueOnce(withStatus(502)).mockResolvedValueOnce('ok');
    await expect(withTransientRetry(task, { delays: [0, 0] })).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
