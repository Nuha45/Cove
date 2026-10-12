import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BusinessActionDialog from './BusinessActionDialog';
import { archiveAdminBusiness, deleteAdminBusiness, setAdminBusinessOwnerAdmin } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  archiveAdminBusiness: vi.fn(),
  restoreAdminBusiness: vi.fn(),
  deleteAdminBusiness: vi.fn(),
  setAdminBusinessOwnerAdmin: vi.fn(),
}));

const BUSINESS = { id: '64b000000000000000000001', name: 'Nuha Jewelry', slug: 'nuha-jewelry' };

function renderDelete(props = {}) {
  const handlers = { onClose: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
  render(<BusinessActionDialog business={BUSINESS} mode="delete" {...handlers} {...props} />);
  return handlers;
}

function typeSlug(value) {
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value } });
}

function deleteButton() {
  return screen.getByRole('button', { name: 'Delete permanently' });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BusinessActionDialog delete seller account', () => {
  it('explains that deletion is permanent and covers the account, shop data and uploaded files', () => {
    renderDelete();
    expect(screen.getByRole('dialog')).toBeTruthy();
    const text = screen.getByText(/permanently deletes the seller account/).textContent;
    expect(text).toMatch(/products, orders, customers/);
    expect(text).toMatch(/uploaded file/);
    expect(text).toMatch(/cannot be undone/);
  });

  it('keeps permanent deletion disabled until the exact slug is typed', () => {
    renderDelete();
    expect(deleteButton().disabled).toBe(true);
    for (const wrong of ['', 'nuha', 'NUHA-JEWELRY', 'nuha-jewelry-x', 'other-shop']) {
      typeSlug(wrong);
      expect(deleteButton().disabled).toBe(true);
    }
    typeSlug('nuha-jewelry');
    expect(deleteButton().disabled).toBe(false);
  });

  it('sends the shop id and typed slug to the server only on confirm', async () => {
    vi.mocked(deleteAdminBusiness).mockResolvedValue({ id: BUSINESS.id, deleted: {} });
    const handlers = renderDelete();
    typeSlug('nuha-jewelry');
    expect(deleteAdminBusiness).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(deleteButton());
    });
    expect(deleteAdminBusiness).toHaveBeenCalledTimes(1);
    expect(deleteAdminBusiness).toHaveBeenCalledWith(BUSINESS.id, 'nuha-jewelry');
    expect(handlers.onDone).toHaveBeenCalledWith('delete', { id: BUSINESS.id, deleted: {} });
  });

  it('shows the server rejection and asks the page to reload the shop', async () => {
    vi.mocked(deleteAdminBusiness).mockRejectedValue({
      response: { status: 400, data: { message: 'Type the shop link exactly to confirm deletion.' } },
    });
    const handlers = renderDelete();
    typeSlug('nuha-jewelry');
    await act(async () => {
      fireEvent.click(deleteButton());
    });
    expect(screen.getByText('Type the shop link exactly to confirm deletion.')).toBeTruthy();
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onFailed).toHaveBeenCalledWith('delete');
  });

  it('a stale slug no longer confirms once the page shows the current shop', () => {
    const handlers = { onClose: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
    const { rerender } = render(<BusinessActionDialog business={BUSINESS} mode="delete" {...handlers} />);
    typeSlug('nuha-jewelry');
    expect(deleteButton().disabled).toBe(false);
    rerender(<BusinessActionDialog business={{ ...BUSINESS, slug: 'nuha-gems' }} mode="delete" {...handlers} />);
    expect(deleteButton().disabled).toBe(true);
  });
});

describe('BusinessActionDialog archive', () => {
  function renderArchive(subscription) {
    const handlers = { onClose: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
    render(<BusinessActionDialog business={{ ...BUSINESS, subscription }} mode="archive" {...handlers} />);
    return handlers;
  }

  it('warns about billing before archiving a shop with no chargeable subscription', () => {
    renderArchive({ liveProviderSubscription: false });
    expect(screen.getByText(/Billing check: an archived owner cannot log in/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Archive shop' }).disabled).toBe(false);
  });

  it('blocks archiving upfront when the shop has a Razorpay subscription that can still charge', async () => {
    const handlers = renderArchive({ liveProviderSubscription: true });
    expect(screen.getByRole('alert').textContent).toMatch(/Cancel the subscription in Razorpay first/);
    const button = screen.getByRole('button', { name: 'Archive shop' });
    expect(button.disabled).toBe(true);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(archiveAdminBusiness).not.toHaveBeenCalled();
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it('allows archiving an unfinished checkout and says it will be cancelled in Razorpay first', async () => {
    vi.mocked(archiveAdminBusiness).mockResolvedValue({ business: BUSINESS });
    const handlers = renderArchive({ liveProviderSubscription: true, unfinishedCheckout: true, billingStatus: 'incomplete' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/unfinished Razorpay checkout/).textContent).toMatch(/cancels it in Razorpay first/);
    const button = screen.getByRole('button', { name: 'Archive shop' });
    expect(button.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(archiveAdminBusiness).toHaveBeenCalledWith(BUSINESS.id);
    expect(handlers.onDone).toHaveBeenCalledWith('archive', { business: BUSINESS });
  });

  it('explains why a paid plan set to cancel at period end blocks archiving', () => {
    renderArchive({
      liveProviderSubscription: true,
      billingStatus: 'active',
      cancelAtPeriodEnd: true,
      currentPeriodEndAt: '2026-11-05T00:00:00.000Z',
    });
    const alert = screen.getByRole('alert').textContent;
    expect(alert).toMatch(/paid until 5 Nov 2026/);
    expect(alert).toMatch(/Razorpay will not charge again/);
    expect(screen.getByRole('button', { name: 'Archive shop' }).disabled).toBe(true);
  });

  it('shows no billing warning for other actions', () => {
    render(<BusinessActionDialog business={{ ...BUSINESS, subscription: { liveProviderSubscription: true } }} mode="restore" onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByText(/Billing check/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore shop' }).disabled).toBe(false);
  });

  it('shows why the server refused to archive a shop with a live subscription', async () => {
    const message = 'This shop still has a Razorpay subscription that can charge the seller. Archiving would lock them out before they could cancel it. Cancel the subscription in Razorpay first, then archive once this page shows it as cancelled.';
    vi.mocked(archiveAdminBusiness).mockRejectedValue({ response: { status: 409, data: { message } } });
    const handlers = { onClose: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
    render(<BusinessActionDialog business={BUSINESS} mode="archive" {...handlers} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Archive shop' }));
    });
    expect(archiveAdminBusiness).toHaveBeenCalledWith(BUSINESS.id);
    expect(screen.getByText(message)).toBeTruthy();
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onFailed).toHaveBeenCalledWith('archive');
    expect(screen.getByRole('button', { name: 'Archive shop' }).disabled).toBe(false);
  });
});

describe('BusinessActionDialog admin access', () => {
  const OWNED = { ...BUSINESS, owner: { name: 'Friend', email: 'friend@example.com', isPlatformAdmin: false } };

  function renderAdmin(mode) {
    const handlers = { onClose: vi.fn(), onDone: vi.fn(), onFailed: vi.fn() };
    render(<BusinessActionDialog business={OWNED} mode={mode} {...handlers} />);
    return handlers;
  }

  it('requires the owner email before granting admin access and sends grant=true', async () => {
    vi.mocked(setAdminBusinessOwnerAdmin).mockResolvedValue({ business: OWNED });
    const handlers = renderAdmin('grantAdmin');
    const button = screen.getByRole('button', { name: 'Grant admin access' });
    expect(screen.getByText(/open the Admin panel/)).toBeTruthy();
    expect(button.disabled).toBe(true);
    typeSlug('friend@example');
    expect(button.disabled).toBe(true);
    typeSlug('Friend@Example.com');
    expect(button.disabled).toBe(false);
    expect(setAdminBusinessOwnerAdmin).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(button);
    });
    expect(setAdminBusinessOwnerAdmin).toHaveBeenCalledWith(BUSINESS.id, { grant: true, confirmEmail: 'Friend@Example.com' });
    expect(handlers.onDone).toHaveBeenCalledWith('grantAdmin', { business: OWNED });
  });

  it('sends grant=false when removing admin access', async () => {
    vi.mocked(setAdminBusinessOwnerAdmin).mockResolvedValue({ business: OWNED });
    renderAdmin('revokeAdmin');
    expect(screen.getByText(/lose the Admin panel immediately/)).toBeTruthy();
    typeSlug('friend@example.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove admin access' }));
    });
    expect(setAdminBusinessOwnerAdmin).toHaveBeenCalledWith(BUSINESS.id, { grant: false, confirmEmail: 'friend@example.com' });
  });

  it('shows the server refusal instead of assuming the change worked', async () => {
    vi.mocked(setAdminBusinessOwnerAdmin).mockRejectedValue({
      response: { status: 403, data: { message: 'You do not have access to this area.' } },
    });
    const handlers = renderAdmin('grantAdmin');
    typeSlug('friend@example.com');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Grant admin access' }));
    });
    expect(screen.getByText('You do not have access to this area.')).toBeTruthy();
    expect(handlers.onDone).not.toHaveBeenCalled();
    expect(handlers.onFailed).toHaveBeenCalledWith('grantAdmin');
  });
});
