import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminBusinessDetailPage from './AdminBusinessDetailPage';
import { getAdminBusiness } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  getAdminBusiness: vi.fn(),
  archiveAdminBusiness: vi.fn(),
  restoreAdminBusiness: vi.fn(),
  deleteAdminBusiness: vi.fn(),
  setAdminBusinessOwnerAdmin: vi.fn(),
}));

function business(owner, extra = {}) {
  return {
    id: '64b000000000000000000001',
    name: 'Nuha Jewelry',
    slug: 'nuha-jewelry',
    category: 'Jewelry & Accessories',
    city: '',
    phone: '',
    storefrontActive: true,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    owner: { name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: '2026-09-01T00:00:00.000Z', ...owner },
    subscription: {
      accountStatus: 'payment_required',
      accountStatusLabel: 'Payment required',
      billingStatus: 'incomplete',
      trialPaymentMethod: null,
      liveProviderSubscription: false,
    },
    store: { state: 'live', label: 'Live' },
    setup: { emailVerified: true, hasActiveProduct: false, paymentsReady: false, done: 1, total: 3, complete: false },
    lastActivity: null,
    lastSellerActivity: null,
    firstStorefrontOrderAt: null,
    counts: { products: 0, activeProducts: 0, orders: 0, storefrontOrders: 0, customers: 0, customerRequests: 0 },
    receipts: { items: [], totals: [] },
    adminHistory: [],
    ...extra,
  };
}

async function renderPage(data) {
  vi.mocked(getAdminBusiness).mockResolvedValue({ business: data });
  render(
    <MemoryRouter initialEntries={[`/admin/businesses/${data.id}`]}>
      <Routes>
        <Route path="/admin/businesses/:id" element={<AdminBusinessDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByText('Admin access');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminBusinessDetailPage admin access', () => {
  it('offers to grant admin access to a seller owner', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }));
    expect(screen.getByText('Seller')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Make platform admin/ }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /Remove admin access/ })).toBeNull();
  });

  it('offers to remove admin access from another admin', async () => {
    await renderPage(business({ isPlatformAdmin: true, isYou: false }));
    expect(screen.getByText('Platform admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove admin access/ })).toBeTruthy();
  });

  it('never offers to change your own admin access', async () => {
    await renderPage(business({ isPlatformAdmin: true, isYou: true }));
    expect(screen.getByText(/This is your account/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove admin access/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Make platform admin/ })).toBeNull();
  });

  it('does not let an archived shop owner be made an admin', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }, { archivedAt: '2026-09-20T00:00:00.000Z' }));
    expect(screen.getByRole('button', { name: /Make platform admin/ }).disabled).toBe(true);
  });
});

describe('AdminBusinessDetailPage shop details', () => {
  it('shows the real storefront state, verification, phone and setup instead of the seller toggle alone', async () => {
    await renderPage(business(
      { isPlatformAdmin: false, isYou: false, emailVerified: false },
      {
        phone: '9876543210',
        store: { state: 'closed_unverified', label: 'Closed: email not verified' },
        setup: { emailVerified: false, hasActiveProduct: true, paymentsReady: false, done: 1, total: 3, complete: false },
      }
    ));
    expect(screen.getByText('Closed: email not verified')).toBeTruthy();
    expect(screen.queryByText('Live')).toBeNull();
    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('Setup (1/3)')).toBeTruthy();
    expect(screen.getByText(/✗ Online payment set up/)).toBeTruthy();
    expect(screen.getByText(/✓ Active product/)).toBeTruthy();
  });

  it('separates seller actions from store activity and shows storefront orders', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }, {
      counts: { products: 3, activeProducts: 2, orders: 5, storefrontOrders: 4, customers: 2, customerRequests: 0 },
      firstStorefrontOrderAt: '2026-09-05T00:00:00.000Z',
      lastSellerActivity: { type: 'payment', label: 'Updated an order payment', at: '2026-09-10T10:00:00.000Z' },
      lastActivity: { type: 'order', label: 'Order received', at: '2026-09-11T10:00:00.000Z' },
    }));
    expect(screen.getByText('4 from storefront')).toBeTruthy();
    expect(screen.getByText(/^5 Sept? 2026$/)).toBeTruthy();
    expect(screen.getByText(/Updated an order payment/)).toBeTruthy();
    expect(screen.getByText(/Order received/)).toBeTruthy();
  });

  it('shows trial autopay, whether Razorpay can still charge, payments received and admin history', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }, {
      subscription: {
        accountStatus: 'trial',
        accountStatusLabel: 'Trial',
        billingStatus: 'trialing',
        trialStartAt: '2026-09-01T00:00:00.000Z',
        trialEndAt: '2026-09-08T00:00:00.000Z',
        trialPaymentMethod: 'autopay',
        liveProviderSubscription: true,
      },
      receipts: {
        items: [{
          id: 'r1', receiptNumber: 'CR-000007', planName: 'Cove Plus', amountPaise: 89900, currency: 'INR',
          paidAt: '2026-08-01T00:00:00.000Z', periodStartAt: null, periodEndAt: '2026-08-31T00:00:00.000Z',
        }],
        totals: [{ currency: 'INR', totalPaise: 89900, payments: 1 }],
      },
      adminHistory: [{
        id: 'h1', action: 'restore', label: 'Restored shop', adminEmail: 'ops@example.com', targetEmail: '',
        at: '2026-09-12T09:00:00.000Z',
      }],
    }));
    expect(screen.getByText('Autopay set up')).toBeTruthy();
    expect(screen.getByText('Not cancelled: can still charge')).toBeTruthy();
    expect(screen.getByText(/CR-000007/)).toBeTruthy();
    expect(screen.getByText(/· 1 payment$/)).toBeTruthy();
    expect(screen.getByText('Restored shop')).toBeTruthy();
    expect(screen.getByText(/ops@example.com/)).toBeTruthy();
  });

  it('says plainly when nothing has been paid or changed by an admin', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }));
    expect(screen.getByText('No Cove subscription payments recorded for this shop.')).toBeTruthy();
    expect(screen.getByText('No admin actions on this shop yet.')).toBeTruthy();
    expect(screen.getByText('None that can charge')).toBeTruthy();
    expect(screen.getByText(/cannot be archived/)).toBeTruthy();
    expect(screen.getByText('Captured by Razorpay, before any refunds.')).toBeTruthy();
  });

  it('tells an unfinished checkout and a plan ending at period end apart from a subscription that can charge', async () => {
    await renderPage(business({ isPlatformAdmin: false, isYou: false }, {
      subscription: {
        accountStatus: 'trial_ended', accountStatusLabel: 'Trial ended', billingStatus: 'incomplete',
        trialPaymentMethod: null, liveProviderSubscription: true, unfinishedCheckout: true,
      },
    }));
    expect(screen.getByText('Unfinished checkout: cannot charge unless the seller completes it')).toBeTruthy();
    cleanup();

    await renderPage(business({ isPlatformAdmin: false, isYou: false }, {
      subscription: {
        accountStatus: 'cancelling', accountStatusLabel: 'Cancelling', billingStatus: 'active',
        trialPaymentMethod: null, liveProviderSubscription: true, unfinishedCheckout: false, cancelAtPeriodEnd: true,
      },
    }));
    expect(screen.getByText('Paid until the period ends, then cancels: will not charge again')).toBeTruthy();
  });
});
