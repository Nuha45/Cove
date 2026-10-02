import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VerifyEmailPage from './VerifyEmailPage';
import { verifyEmail } from '../services/authService';
import { useAuth } from '../context/AuthContext';

vi.mock('../services/authService', () => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const TOKEN = 'a'.repeat(64);
const refreshUser = vi.fn();

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function apiError(status, message, code) {
  return { response: { status, data: { message, errors: [{ field: 'token', message: code }] } } };
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: { emailVerified: false },
    status: 'authenticated',
    refreshUser,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VerifyEmailPage', () => {
  it('loading the page with a token does not verify the account', async () => {
    renderAt(`/verify-email?token=${TOKEN}`);
    await settle();
    expect(verifyEmail).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verify my email' })).toBeTruthy();
    expect(refreshUser).not.toHaveBeenCalled();
  });

  it('clicking Verify my email sends the token once and shows success', async () => {
    vi.mocked(verifyEmail).mockResolvedValue({ message: 'Your email address is verified.', verified: true });
    renderAt(`/verify-email?token=${TOKEN}`);

    const button = screen.getByRole('button', { name: 'Verify my email' });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await settle();

    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/Your email address is verified\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to Cove' })).toBeTruthy();
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('shows the expired state with a resend option after clicking an expired link', async () => {
    vi.mocked(verifyEmail).mockRejectedValue(
      apiError(400, 'This verification link has expired. Log in to request a new one.', 'token_expired')
    );
    renderAt(`/verify-email?token=${TOKEN}`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify my email' }));
    });
    await settle();

    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeTruthy();
    expect(screen.getByText('This verification link has expired. Log in to request a new one.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend verification email' })).toBeTruthy();
  });

  it('shows the invalid state for an invalid or already-used link after clicking', async () => {
    vi.mocked(verifyEmail).mockRejectedValue(
      apiError(400, 'This verification link is invalid or has already been used.', 'token_invalid')
    );
    renderAt(`/verify-email?token=${TOKEN}`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify my email' }));
    });
    await settle();

    expect(screen.getByRole('heading', { name: 'This link cannot be used' })).toBeTruthy();
    expect(screen.getByText('This verification link is invalid or has already been used.')).toBeTruthy();
  });

  it('a link without a token shows the invalid state and offers no verify button', async () => {
    renderAt('/verify-email');
    await settle();
    expect(verifyEmail).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Verify my email' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'This link cannot be used' })).toBeTruthy();
  });
});
