import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminOverviewPage from './AdminOverviewPage';
import { getAdminOverview } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  getAdminOverview: vi.fn(),
}));

const STATUSES = {
  active: 3,
  cancelling: 1,
  trial: 4,
  past_due: 2,
  trial_ended: 5,
  payment_required: 1,
  halted: 1,
  cancelled: 2,
  exempt: 1,
};

function overview(extra = {}) {
  return {
    totals: {
      businesses: 20,
      archived: 2,
      statuses: STATUSES,
      closedStores: { closed_unverified: 2, closed_billing: 6, off: 1 },
      trialPayment: { autopay: 1, checkout_started: 1, none: 2 },
    },
    trialsEndingSoon: {
      windowDays: 7,
      count: 2,
      withoutAutopay: 1,
      items: [
        { id: 'a1', name: 'Asha Bakes', trialEndAt: '2099-01-02T00:00:00.000Z', paymentMethod: 'autopay' },
        { id: 'b1', name: 'Bindu Crafts', trialEndAt: '2099-01-03T00:00:00.000Z', paymentMethod: 'none' },
      ],
    },
    revenue: {
      currency: 'INR',
      activeSubscriptions: 3,
      cancellingSubscriptions: 1,
      estimatedMrr: 2097,
      plans: [
        { key: 'pro', name: 'Cove Basic', pricePerMonth: 599, activeSubscriptions: 2 },
        { key: 'advanced', name: 'Cove Plus', pricePerMonth: 899, activeSubscriptions: 1 },
      ],
    },
    collected: {
      windowDays: 30,
      currencies: [{
        currency: 'INR', totalPaise: 359600, payments: 5, windowPaise: 149800, windowPayments: 2,
        firstPaidAt: '2026-06-01T00:00:00.000Z', lastPaidAt: '2026-09-30T00:00:00.000Z',
      }],
    },
    recentSignups: [{
      id: 's1',
      name: 'Chitra Sarees',
      createdAt: '2026-10-01T00:00:00.000Z',
      owner: { name: 'Chitra', email: 'chitra@example.com', emailVerified: false },
      subscription: { accountStatus: 'trial', accountStatusLabel: 'Trial' },
      store: { state: 'closed_unverified', label: 'Closed: email not verified' },
    }],
    recentAdminActions: [
      {
        id: 'x1', action: 'delete', label: 'Deleted seller account', adminEmail: 'ops@example.com', businessId: 'gone1',
        businessName: 'Old Shop', businessSlug: 'old-shop', businessExists: false, targetEmail: '',
        summary: 'Deleted 2 products, 1 order and 1 customer.', at: '2026-10-10T10:00:00.000Z',
      },
      {
        id: 'x2', action: 'archive', label: 'Archived shop', adminEmail: 'ops@example.com', businessId: 'live1',
        businessName: 'Paused Shop', businessSlug: 'paused-shop', businessExists: true, targetEmail: '', summary: '',
        at: '2026-10-09T10:00:00.000Z',
      },
    ],
    ...extra,
  };
}

async function renderPage(data) {
  vi.mocked(getAdminOverview).mockResolvedValue({ overview: data });
  render(
    <MemoryRouter>
      <AdminOverviewPage />
    </MemoryRouter>
  );
  await screen.findByText('Collected subscription payments');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminOverviewPage', () => {
  it('splits paying, trial, payment problems and not-paying accounts honestly', async () => {
    await renderPage(overview());
    expect(screen.getByText('2 archived not counted')).toBeTruthy();
    expect(screen.getByText('1 cancelling')).toBeTruthy();
    expect(screen.getByText('1 with autopay')).toBeTruthy();
    expect(screen.getByText('2 past due · 1 halted')).toBeTruthy();
    expect(screen.getByText('5 trial ended · 2 cancelled')).toBeTruthy();
    expect(screen.queryByText('All time')).toBeNull();
    const breakdown = screen.getByRole('heading', { name: 'Accounts by status' }).closest('section');
    expect(within(breakdown).getByText('Admin shops (no plan needed)')).toBeTruthy();
    expect(within(breakdown).getByText('Storefront closed: no active plan').nextSibling.textContent).toBe('6');
  });

  it('shows money collected from receipts separately from the list-price MRR estimate', async () => {
    await renderPage(overview());
    const collected = screen.getByRole('heading', { name: 'Collected subscription payments' }).closest('section');
    expect(within(collected).getByText('₹1,498')).toBeTruthy();
    expect(within(collected).getByText(/2 payments · ₹3,596 from 5 payments recorded since/)).toBeTruthy();
    expect(within(collected).getByText(/receipt backfill/)).toBeTruthy();
    expect(within(collected).getByText(/before any refunds/)).toBeTruthy();

    const estimate = screen.getByRole('heading', { name: 'Estimated MRR' }).closest('section');
    expect(within(estimate).getByText('₹2,097')).toBeTruthy();
    expect(within(estimate).getByText(/Not money received\. Excludes 1 cancelling/)).toBeTruthy();
    expect(within(estimate).getByText(/admin shops without a paid plan/)).toBeTruthy();
  });

  it('says so when no payments have been recorded', async () => {
    await renderPage(overview({ collected: { windowDays: 30, currencies: [] } }));
    expect(screen.getByText('No subscription payments have been recorded yet.')).toBeTruthy();
  });

  it('flags which trials ending soon have autopay set up', async () => {
    await renderPage(overview());
    expect(screen.getByText('1 of 2 without autopay')).toBeTruthy();
    const asha = screen.getByText('Asha Bakes').closest('a');
    expect(within(asha).getByText('Autopay set up')).toBeTruthy();
    const bindu = screen.getByText('Bindu Crafts').closest('a');
    expect(within(bindu).getByText('No payment method')).toBeTruthy();
  });

  it('shows unverified signups with their real storefront state', async () => {
    await renderPage(overview());
    const row = screen.getByText('Chitra Sarees').closest('a');
    expect(within(row).getByText(/chitra@example.com \(not verified\)/)).toBeTruthy();
    expect(within(row).getByText('Closed: email not verified')).toBeTruthy();
  });

  it('lists recent admin actions and does not link to deleted shops', async () => {
    await renderPage(overview());
    const deleted = screen.getByText('Deleted seller account: Old Shop');
    expect(deleted.closest('a')).toBeNull();
    expect(screen.getByText(/Deleted 2 products, 1 order and 1 customer\./)).toBeTruthy();
    const archived = screen.getByText('Archived shop: Paused Shop');
    expect(archived.closest('a').getAttribute('href')).toBe('/admin/businesses/live1');
  });
});
