import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';
import { useAuth } from '../context/AuthContext';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

function renderPage() {
  const register = vi.fn(() => Promise.resolve({}));
  vi.mocked(useAuth).mockReturnValue({ register });
  const view = render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
  return { register, ...view };
}

function field(container, name) {
  return container.querySelector(`input[name="${name}"]`);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('shows no example names, emails, phone numbers or places, only the password hint', () => {
    const { container } = renderPage();
    for (const name of ['name', 'email', 'businessName', 'category', 'phone', 'city']) {
      expect(field(container, name).getAttribute('placeholder'), name).toBeNull();
    }
    expect(field(container, 'password').getAttribute('placeholder')).toBe('At least 8 characters');
    expect(container.textContent).not.toMatch(/Aisha|Zahra|98765|Bengaluru/);
  });

  it('asks for a store type and sends a typed one', async () => {
    const { container, register } = renderPage();
    fireEvent.change(field(container, 'name'), { target: { value: 'Nuha' } });
    fireEvent.change(field(container, 'email'), { target: { value: 'nuha@example.com' } });
    fireEvent.change(field(container, 'password'), { target: { value: 'secret123' } });
    fireEvent.change(field(container, 'confirmPassword'), { target: { value: 'secret123' } });
    fireEvent.change(field(container, 'businessName'), { target: { value: 'Nuha Studio' } });
    fireEvent.change(field(container, 'phone'), { target: { value: '9876543210' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    });
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText('Choose or type your store type.')).toBeTruthy();

    fireEvent.change(field(container, 'category'), { target: { value: '  Handmade   Soap ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ category: 'Handmade Soap' }));
  });

  it('requires a valid phone number and does not mark it optional', async () => {
    const { container, register } = renderPage();
    expect(field(container, 'phone').closest('label').textContent).not.toMatch(/optional/i);
    fireEvent.change(field(container, 'name'), { target: { value: 'Nuha' } });
    fireEvent.change(field(container, 'email'), { target: { value: 'nuha@example.com' } });
    fireEvent.change(field(container, 'password'), { target: { value: 'secret123' } });
    fireEvent.change(field(container, 'confirmPassword'), { target: { value: 'secret123' } });
    fireEvent.change(field(container, 'businessName'), { target: { value: 'Nuha Studio' } });
    fireEvent.change(field(container, 'category'), { target: { value: 'Henna' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    });
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter your phone number.')).toBeTruthy();

    fireEvent.change(field(container, 'phone'), { target: { value: 'abc' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    });
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter a valid phone number.')).toBeTruthy();

    fireEvent.change(field(container, 'phone'), { target: { value: ' +91 98765 43210 ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    });
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ phone: '+91 98765 43210' }));
  });
});
