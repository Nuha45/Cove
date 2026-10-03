import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';
import { UNAVAILABLE_MESSAGE, WAKING_MESSAGE } from '../utils/retry';
import { useAuth } from '../context/AuthContext';
import { wakeApi } from '../services/authService';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/authService', () => ({ wakeApi: vi.fn(() => Promise.resolve(true)) }));

function httpError(status, message) {
  const error = new Error(`Request failed with status code ${status}`);
  error.isAxiosError = true;
  error.response = { status, data: message ? { message } : {} };
  return error;
}

function networkError() {
  const error = new Error('Network Error');
  error.isAxiosError = true;
  error.code = 'ERR_NETWORK';
  error.request = {};
  return error;
}

function renderPage(login) {
  vi.mocked(useAuth).mockReturnValue({ login });
  const view = render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<p>Dashboard home</p>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.change(view.container.querySelector('input[name="email"]'), { target: { value: ' seller@example.com ' } });
  fireEvent.change(view.container.querySelector('input[name="password"]'), { target: { value: 'secret123' } });
  return view;
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /log in|logging in|waking/i }));
  });
}

async function advance(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('LoginPage cold-start handling', () => {
  it('pings the API once on load to wake it, without polling', async () => {
    renderPage(vi.fn());
    await advance(60_000);
    expect(wakeApi).toHaveBeenCalledTimes(1);
  });

  it('retries a 502, shows the waking message, then logs in without another click', async () => {
    const login = vi.fn()
      .mockRejectedValueOnce(httpError(502))
      .mockResolvedValueOnce({ user: {} });
    renderPage(login);

    await submit();
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe(WAKING_MESSAGE);
    expect(screen.getByRole('button', { name: 'Waking up Cove...' }).disabled).toBe(true);

    await advance(1500);
    expect(login).toHaveBeenCalledTimes(2);
    expect(login).toHaveBeenLastCalledWith({ email: 'seller@example.com', password: 'secret123' });
    expect(screen.getByText('Dashboard home')).toBeTruthy();
  });

  it('retries at most twice, then shows a helpful unavailable message', async () => {
    const login = vi.fn()
      .mockRejectedValueOnce(httpError(502))
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(httpError(503));
    renderPage(login);

    await submit();
    await advance(1500);
    await advance(3000);
    await advance(10_000);

    expect(login).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe(UNAVAILABLE_MESSAGE);
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' }).disabled).toBe(false);
  });

  it('does not retry incorrect credentials', async () => {
    const login = vi.fn().mockRejectedValue(httpError(401, 'Email or password is incorrect.'));
    renderPage(login);

    await submit();
    await advance(10_000);

    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.');
  });

  it.each([400, 403, 429, 500])('does not retry a %s response', async (status) => {
    const login = vi.fn().mockRejectedValue(httpError(status, `Failed with ${status}`));
    renderPage(login);

    await submit();
    await advance(10_000);

    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe(`Failed with ${status}`);
  });

  it('ignores repeat submits while a login or retry is in progress', async () => {
    let resolveLogin;
    const login = vi.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLogin = resolve; }));
    const { container } = renderPage(login);
    const form = container.querySelector('form');

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(login).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.submit(form);
    });
    await advance(1500);
    expect(login).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(login).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveLogin({ user: {} });
    });
    expect(screen.getByText('Dashboard home')).toBeTruthy();
    expect(login).toHaveBeenCalledTimes(2);
  });
});
