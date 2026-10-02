import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/productService', () => ({ listProducts: vi.fn(() => Promise.resolve({ total: 1, products: [] })) }));
vi.mock('../services/billingService', () => ({ getBilling: vi.fn(() => Promise.resolve({ access: 'ok', store: { paused: false } })) }));
vi.mock('../components/layout/Sidebar', () => ({ default: () => null }));
vi.mock('../components/layout/TopBar', () => ({ default: () => null }));
vi.mock('../components/onboarding/OnboardingModal', () => ({ default: () => null }));

const refreshUser = vi.fn();

function renderDashboard(user) {
  vi.mocked(useAuth).mockReturnValue({
    user,
    business: { id: 'b1', slug: 'shop' },
    logout: vi.fn(),
    refreshUser,
  });
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<p>Dashboard home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

async function returnToTab() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardLayout email verification', () => {
  it('stays usable while unverified and shows the verification banner', async () => {
    renderDashboard({ email: 'seller@example.com', emailVerified: false });
    expect(screen.getByText('Dashboard home')).toBeTruthy();
    expect(screen.getByText('Check your email to verify your Cove account')).toBeTruthy();
  });

  it('re-checks verification when an unverified seller returns to the tab', async () => {
    renderDashboard({ email: 'seller@example.com', emailVerified: false });
    await returnToTab();
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('does not poll for verified sellers and shows no banner', async () => {
    renderDashboard({ email: 'seller@example.com', emailVerified: true });
    await returnToTab();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.queryByText('Check your email to verify your Cove account')).toBeNull();
  });
});
