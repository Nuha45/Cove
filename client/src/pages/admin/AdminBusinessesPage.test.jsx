import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminBusinessesPage from './AdminBusinessesPage';
import { listAdminBusinesses } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  listAdminBusinesses: vi.fn(),
  archiveAdminBusiness: vi.fn(),
  restoreAdminBusiness: vi.fn(),
  deleteAdminBusiness: vi.fn(),
  setAdminBusinessOwnerAdmin: vi.fn(),
}));

function row(extra = {}) {
  return {
    id: '64b000000000000000000001',
    name: 'Nuha Jewelry',
    slug: 'nuha-jewelry',
    category: 'Jewelry & Accessories',
    createdAt: '2026-09-01T00:00:00.000Z',
    archivedAt: null,
    owner: { name: 'Nuha', email: 'nuha@example.com', emailVerified: true },
    subscription: {
      accountStatus: 'trial',
      accountStatusLabel: 'Trial',
      trialPaymentMethod: 'none',
      liveProviderSubscription: false,
    },
    store: { state: 'live', label: 'Live' },
    setup: { emailVerified: true, hasActiveProduct: true, paymentsReady: false, done: 2, total: 3, complete: false },
    counts: { products: 3, activeProducts: 2, orders: 1, storefrontOrders: 1 },
    firstStorefrontOrderAt: '2026-09-04T00:00:00.000Z',
    lastSellerActivity: { type: 'product', label: 'Added a product', at: '2026-09-03T00:00:00.000Z' },
    ...extra,
  };
}

function page(businesses) {
  return { businesses, total: businesses.length, page: 1, limit: 20, totalPages: 1 };
}

async function renderPage(businesses = [row()]) {
  vi.mocked(listAdminBusinesses).mockResolvedValue(page(businesses));
  render(
    <MemoryRouter>
      <AdminBusinessesPage />
    </MemoryRouter>
  );
  await screen.findByText(`${businesses.length} ${businesses.length === 1 ? 'business' : 'businesses'}`);
}

function desktopRow(name) {
  return screen.getAllByText(name).map((node) => node.closest('.table-row')).find(Boolean);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminBusinessesPage', () => {
  it('shows status, trial payment method, setup, counts and seller activity for each shop', async () => {
    await renderPage();
    const tableRow = desktopRow('Nuha Jewelry');
    expect(within(tableRow).getByText('Trial')).toBeTruthy();
    expect(within(tableRow).getByText('No payment method')).toBeTruthy();
    expect(within(tableRow).getByText('2/3')).toBeTruthy();
    expect(within(tableRow).getByText('Missing: Online payment set up')).toBeTruthy();
    expect(within(tableRow).getByText('2 active products · 1 order')).toBeTruthy();
    expect(within(tableRow).getByText(/^Added a product · 3 Sept? 2026$/)).toBeTruthy();
    expect(within(tableRow).queryByText('Live')).toBeNull();
  });

  it('flags unverified owners and closed storefronts', async () => {
    await renderPage([row({
      owner: { name: 'Ravi', email: 'ravi@example.com', emailVerified: false },
      store: { state: 'closed_unverified', label: 'Closed: email not verified' },
      setup: { emailVerified: false, hasActiveProduct: false, paymentsReady: false, done: 0, total: 3, complete: false },
      lastSellerActivity: null,
    })]);
    const tableRow = desktopRow('Nuha Jewelry');
    expect(within(tableRow).getByText('ravi@example.com · Not verified')).toBeTruthy();
    expect(within(tableRow).getByText('Closed: email not verified')).toBeTruthy();
    expect(within(tableRow).getByText('No seller activity yet')).toBeTruthy();
  });

  it('asks the server for the chosen filter and starts again from page 1', async () => {
    await renderPage();
    expect(listAdminBusinesses).toHaveBeenLastCalledWith({ search: undefined, filter: undefined, page: 1, limit: 20 });
    const select = screen.getByRole('combobox', { name: 'Show businesses' });
    const values = [...select.querySelectorAll('option')].map((option) => option.value);
    expect(values).toEqual([
      'all', 'needs_setup', 'email_unverified', 'trial_no_autopay', 'trial_ended', 'past_due',
      'halted', 'cancelling', 'cancelled', 'active', 'exempt', 'archived',
    ]);

    vi.mocked(listAdminBusinesses).mockResolvedValue(page([]));
    await act(async () => {
      fireEvent.change(select, { target: { value: 'trial_no_autopay' } });
    });
    expect(listAdminBusinesses).toHaveBeenLastCalledWith({ search: undefined, filter: 'trial_no_autopay', page: 1, limit: 20 });
    expect(await screen.findByText('No matching businesses')).toBeTruthy();
    expect(screen.getByText('Try a different search or filter.')).toBeTruthy();
  });

  it('opens the archive dialog with the shop billing state so a live subscription is blocked upfront', async () => {
    await renderPage([row({ subscription: { accountStatus: 'active', accountStatusLabel: 'Paying', trialPaymentMethod: null, liveProviderSubscription: true } })]);
    const tableRow = desktopRow('Nuha Jewelry');
    await act(async () => {
      fireEvent.click(within(tableRow).getByRole('button', { name: 'Archive Nuha Jewelry' }));
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toMatch(/can still charge the seller/);
    expect(within(dialog).getByRole('button', { name: 'Archive shop' }).disabled).toBe(true);
  });
});
