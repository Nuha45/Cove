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
    storefrontActive: true,
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    owner: { name: 'Owner', email: 'owner@example.com', createdAt: '2026-09-01T00:00:00.000Z', ...owner },
    subscription: { accountStatus: 'payment_required', accountStatusLabel: 'Payment required', billingStatus: 'incomplete' },
    lastActivity: null,
    counts: { products: 0, activeProducts: 0, orders: 0, customers: 0, customerRequests: 0 },
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
