import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import ProtectedRoute from '../routes/ProtectedRoute';
import GuestRoute from '../routes/GuestRoute';
import * as authService from '../services/authService';
import { UNAVAILABLE_MESSAGE, WAKING_MESSAGE } from '../utils/retry';

vi.mock('../services/authService', () => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));

const session = {
  user: { id: 'u1', name: 'Nuha' },
  business: { id: 'b1', name: 'Nuha Jewelry', currency: 'INR' },
};

function httpError(status) {
  return Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, data: {} } });
}

function renderApp(path) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<p>Login form</p>} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<p>Dashboard home</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
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

describe('restoring a saved session after a browser restart', () => {
  it('opens the dashboard straight away when the saved cookie is valid', async () => {
    vi.mocked(authService.me).mockResolvedValue(session);
    renderApp('/dashboard');
    await advance(0);
    expect(screen.getByText('Dashboard home')).toBeTruthy();
    expect(authService.me).toHaveBeenCalledTimes(1);
  });

  it('waits for a sleeping API and keeps the seller signed in', async () => {
    vi.mocked(authService.me)
      .mockRejectedValueOnce(httpError(502))
      .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', request: {} }))
      .mockResolvedValueOnce(session);
    renderApp('/dashboard');

    await advance(0);
    expect(screen.getByText(WAKING_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Login form')).toBeNull();

    await advance(1500);
    await advance(3000);
    expect(authService.me).toHaveBeenCalledTimes(3);
    expect(screen.getByText('Dashboard home')).toBeTruthy();
  });

  it('sends a returning seller on the login page to the dashboard once the API wakes', async () => {
    vi.mocked(authService.me).mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(session);
    renderApp('/login');

    await advance(0);
    expect(screen.getByText(WAKING_MESSAGE)).toBeTruthy();
    expect(screen.queryByText('Login form')).toBeNull();

    await advance(1500);
    expect(screen.getByText('Dashboard home')).toBeTruthy();
  });

  it('does not retry an expired or missing session', async () => {
    vi.mocked(authService.me).mockRejectedValue(httpError(401));
    renderApp('/dashboard');

    await advance(20_000);
    expect(authService.me).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Login form')).toBeTruthy();
  });

  it('stops after a bounded number of retries and explains the API is still starting', async () => {
    vi.mocked(authService.me).mockRejectedValue(httpError(503));
    renderApp('/dashboard');

    await advance(0);
    await advance(1500);
    await advance(3000);
    await advance(6000);
    await advance(60_000);

    expect(authService.me).toHaveBeenCalledTimes(4);
    expect(screen.getByText(UNAVAILABLE_MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
