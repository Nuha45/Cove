import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProductModal from './ProductModal';
import { updateProduct } from '../../services/productService';

vi.mock('../../services/productService', () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(async (id, input) => ({ product: { id, ...input } })),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ business: { currency: 'INR' } }),
}));

const PRODUCT = {
  id: 'p1',
  name: 'Gold Hoops',
  price: 1250,
  stockQuantity: 10,
  category: 'Earrings',
  description: '',
  status: 'Active',
  images: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function save(changes) {
  const onSaved = vi.fn();
  const { container } = render(<ProductModal product={PRODUCT} onClose={vi.fn()} onSaved={onSaved} />);
  for (const [name, value] of Object.entries(changes)) {
    fireEvent.change(container.querySelector(`[name="${name}"]`), { target: { name, value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  return updateProduct.mock.calls[0][1];
}

describe('ProductModal editing', () => {
  it('does not resend the loaded stock, so sales made while editing are kept', async () => {
    const payload = await save({ price: '1300' });
    expect(payload.price).toBe(1300);
    expect('stockQuantity' in payload).toBe(false);
  });

  it('sends stock when the seller changes it', async () => {
    const payload = await save({ stockQuantity: '4' });
    expect(payload.stockQuantity).toBe(4);
  });
});
