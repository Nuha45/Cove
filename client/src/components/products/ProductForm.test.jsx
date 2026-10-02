import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ProductForm, { formFromProduct, productPayload } from './ProductForm';

const PRODUCT = {
  name: 'Gold Hoops',
  price: 1250.5,
  stockQuantity: 3,
  category: 'Earrings',
  description: '',
  status: 'Active',
  images: [],
};

function renderForm(currency) {
  const form = formFromProduct(PRODUCT);
  const view = render(
    <ProductForm
      form={form}
      errors={{}}
      formError=""
      submitting={false}
      submitLabel="Save changes"
      onChange={vi.fn()}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      currency={currency}
    />
  );
  return { form, ...view };
}

afterEach(cleanup);

describe('ProductForm price field', () => {
  it.each([
    ['INR', '₹'],
    ['AED', 'د.إ'],
    ['USD', '$'],
    ['GBP', '£'],
    ['EUR', '€'],
  ])('shows the %s symbol', (currency, symbol) => {
    renderForm(currency);
    const input = screen.getByLabelText(`Price (${symbol})`);
    expect(input.getAttribute('placeholder')).toBe(`${symbol} 0`);
  });

  it('keeps the stored price when the store currency switches', () => {
    const { form, rerender } = renderForm('INR');
    expect(screen.getByLabelText('Price (₹)').value).toBe('1250.5');

    rerender(
      <ProductForm
        form={form}
        errors={{}}
        formError=""
        submitting={false}
        submitLabel="Save changes"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        currency="AED"
      />
    );
    expect(screen.getByLabelText('Price (د.إ)').value).toBe('1250.5');
    expect(productPayload(form).price).toBe(1250.5);
  });
});
