import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CategoryField from './CategoryField';
import { CATEGORIES, categoryError } from '../../utils/categories';

function Harness({ initial = '', onValue = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <CategoryField
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

function input() {
  return screen.getByRole('textbox', { name: /Store type/ });
}

afterEach(cleanup);

describe('CategoryField', () => {
  it('lets sellers type their own store type', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(input(), { target: { value: 'Handmade Soap' } });
    expect(input().value).toBe('Handmade Soap');
    expect(onValue).toHaveBeenLastCalledWith('Handmade Soap');
  });

  it('fills the field when a suggestion is tapped and marks it selected', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Homemade Food' }));
    expect(input().value).toBe('Homemade Food');
    expect(screen.getByRole('button', { name: 'Homemade Food' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows more store types on request', () => {
    render(<Harness />);
    const last = CATEGORIES[CATEGORIES.length - 1];
    expect(screen.queryByRole('button', { name: last })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /More types/ }));
    expect(screen.getByRole('button', { name: last })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fewer types' }));
    expect(screen.queryByRole('button', { name: last })).toBeNull();
  });

  it('opens expanded when the saved type is in the extra list', () => {
    render(<Harness initial={CATEGORIES[CATEGORIES.length - 1]} />);
    expect(screen.getByRole('button', { name: CATEGORIES[CATEGORIES.length - 1] }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('categoryError', () => {
  it('accepts suggestions and typed store types', () => {
    for (const value of [...CATEGORIES, 'Mehendi Artist', 'Café & Bakery', 'हस्तशिल्प']) {
      expect(categoryError(value), value).toBe('');
    }
  });

  it('rejects empty, too long and markup values', () => {
    for (const value of ['', ' ', 'a', 'a'.repeat(41), '<script>', '{shop}']) {
      expect(categoryError(value), value).not.toBe('');
    }
  });
});
