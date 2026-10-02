import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import BusinessActionDialog from './BusinessActionDialog';
import { deleteAdminBusiness } from '../../services/adminService';

vi.mock('../../services/adminService', () => ({
  archiveAdminBusiness: vi.fn(),
  restoreAdminBusiness: vi.fn(),
  deleteAdminBusiness: vi.fn(),
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
