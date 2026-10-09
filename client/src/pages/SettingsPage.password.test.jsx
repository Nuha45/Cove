import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import SettingsPage from './SettingsPage';
import { useAuth } from '../context/AuthContext';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessService';
import { changePassword } from '../services/authService';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/businessService', () => ({
  getBusinessSettings: vi.fn(),
  updateBusinessSettings: vi.fn(),
}));
vi.mock('../services/authService', () => ({
  changePassword: vi.fn(),
  resendVerification: vi.fn(),
}));

const notify = vi.fn();
let shellPlan = {};

function Shell() {
  return <Outlet context={{ notify, plan: shellPlan }} />;
}

async function renderSellerProfile() {
  renderSettings('/settings?tab=seller-profile');
  await screen.findByRole('button', { name: 'Change password' });
  return { container: document.body };
}

function renderSettings(path) {
  vi.mocked(useAuth).mockReturnValue({
    user: { name: 'Nuha', email: 'seller@example.com', emailVerified: true },
    refresh: vi.fn(),
  });
  vi.mocked(getBusinessSettings).mockResolvedValue({
    business: { id: 'b1', name: 'Nuha Jewelry', slug: 'nuha-jewelry', category: 'Jewelry & Accessories', currency: 'INR' },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function fill(container, values) {
  for (const [name, value] of Object.entries(values)) {
    fireEvent.change(container.querySelector(`input[name="${name}"]`), { target: { value } });
  }
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /change password|changing password/i }));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  shellPlan = {};
});

describe('Seller Profile overview', () => {
  it('shows the account and business summary, and opens Business Profile from it', async () => {
    await renderSellerProfile();
    expect(screen.getByText('Nuha')).toBeTruthy();
    expect(screen.getByText('seller@example.com')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Nuha Jewelry')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View store' }).getAttribute('href')).toBe('/store/nuha-jewelry');

    fireEvent.click(screen.getByRole('button', { name: 'Edit business profile' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Business Profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('shows the Cove plan with a Billing link only once plan data has loaded', async () => {
    await renderSellerProfile();
    expect(screen.queryByRole('link', { name: 'Manage billing' })).toBeNull();
    cleanup();

    shellPlan = { loading: false, inTrial: false, trialEnded: false, storePaused: false, access: 'ok', key: 'advanced', advanced: true };
    await renderSellerProfile();
    expect(screen.getByText('Cove Plus')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage billing' }).getAttribute('href')).toBe('/billing');
    cleanup();

    shellPlan = { loading: false, inTrial: true, trialEnded: false, storePaused: false, access: 'ok', key: 'pro' };
    await renderSellerProfile();
    expect(screen.getByText('Free trial')).toBeTruthy();
    cleanup();

    shellPlan = { loading: false, storePaused: true, access: 'ok', key: 'pro' };
    await renderSellerProfile();
    expect(screen.getByText('Store paused')).toBeTruthy();
  });

  it('hides the plan card when billing data failed to load', async () => {
    shellPlan = { loading: false, key: 'pro', access: 'ok', error: true };
    await renderSellerProfile();
    expect(screen.queryByText('Cove Basic')).toBeNull();
    expect(screen.queryByText('Cove plan')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Manage billing' })).toBeNull();
    expect(screen.getByText('Nuha Jewelry')).toBeTruthy();
  });
});

describe('Settings tabs', () => {
  it('opens Business Profile when no tab is given', async () => {
    renderSettings('/settings');
    expect(await screen.findByRole('heading', { level: 2, name: 'Business Profile' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('keeps a business-save error off the Seller Profile tab', async () => {
    const error = new Error('Request failed with status code 500');
    error.response = { status: 500, data: { message: 'Could not save your shop settings.' } };
    vi.mocked(updateBusinessSettings).mockRejectedValue(error);
    renderSettings('/settings');
    await screen.findByRole('button', { name: 'Save changes' });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(screen.getByText('Could not save your shop settings.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Seller Profile' }));
    expect(screen.queryByText('Could not save your shop settings.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Business Profile' }));
    expect(screen.getByText('Could not save your shop settings.')).toBeTruthy();
  });
});

describe('Seller Profile change password', () => {
  it('uses its own form and never shows the business Save button', async () => {
    const { container } = await renderSellerProfile();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    const passwordForm = container.querySelector('input[name="currentPassword"]').closest('form');
    expect(passwordForm.parentElement.closest('form')).toBeNull();
  });

  it('checks the fields before calling the API', async () => {
    const { container } = await renderSellerProfile();
    fill(container, { currentPassword: '', newPassword: 'short', confirmPassword: 'other' });
    await submit();

    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter your current password.')).toBeTruthy();
    expect(screen.getByText('Use 8 to 72 characters, including a letter and a number.')).toBeTruthy();
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();

    fill(container, { currentPassword: 'OldPass11', newPassword: 'OldPass11', confirmPassword: 'OldPass11' });
    await submit();
    expect(changePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a password different from your current one.')).toBeTruthy();
  });

  it('changes the password, confirms success and clears the fields', async () => {
    let resolve;
    vi.mocked(changePassword).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { container } = await renderSellerProfile();
    fill(container, { currentPassword: 'OldPass11', newPassword: 'NewPass22', confirmPassword: 'NewPass22' });
    await submit();

    expect(screen.getByRole('button', { name: 'Changing password...' }).disabled).toBe(true);
    await act(async () => {
      resolve({ message: 'Your password has been changed.' });
    });

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: 'OldPass11',
      newPassword: 'NewPass22',
      confirmPassword: 'NewPass22',
    });
    expect(screen.getByRole('status').textContent).toBe('Your password has been changed.');
    expect(notify).toHaveBeenCalledWith('Your password has been changed.');
    expect(container.querySelector('input[name="currentPassword"]').value).toBe('');
    expect(container.querySelector('input[name="newPassword"]').value).toBe('');
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });

  it('shows the server error when the current password is wrong', async () => {
    const error = new Error('Request failed with status code 400');
    error.response = {
      status: 400,
      data: {
        message: 'Your current password is incorrect.',
        errors: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }],
      },
    };
    vi.mocked(changePassword).mockRejectedValue(error);
    const { container } = await renderSellerProfile();
    fill(container, { currentPassword: 'Wrong1111', newPassword: 'NewPass22', confirmPassword: 'NewPass22' });
    await submit();

    expect(screen.getByRole('alert').textContent).toBe('Your current password is incorrect.');
    expect(container.querySelector('input[name="newPassword"]').value).toBe('NewPass22');
    expect(screen.getByRole('button', { name: 'Change password' }).disabled).toBe(false);
  });
});
