import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import HelpPage from './HelpPage';
import { useAuth } from '../context/AuthContext';
import { HELP_CATEGORIES } from '../content/helpArticles';
import { LEGAL } from '../content/legal';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const notify = vi.fn();
const openOnboarding = vi.fn();

function Shell() {
  return <Outlet context={{ notify, openOnboarding }} />;
}

function renderHelp(business = { id: 'b1' }) {
  vi.mocked(useAuth).mockReturnValue({ business });
  return render(
    <MemoryRouter initialEntries={['/help']}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/help" element={<HelpPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function article() {
  return screen.getByRole('article');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HelpPage', () => {
  it('opens on the first topic with a shortcut to the page it describes', () => {
    renderHelp();
    expect(within(article()).getByRole('heading', { name: 'Set up your shop' })).toBeTruthy();
    expect(within(article()).getByRole('link', { name: /Open Settings/ }).getAttribute('href')).toBe('/settings');
    expect(screen.getByRole('button', { name: 'Set up your shop' }).getAttribute('aria-current')).toBe('true');
    expect(within(article()).queryByText(/Previous/)).toBeNull();
  });

  it('switches topics from the sidebar, related list, and previous/next buttons', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Pickup and delivery' }));
    expect(within(article()).getByRole('heading', { name: 'Pickup and delivery' })).toBeTruthy();

    const related = within(article()).getByText('More in Orders').parentElement;
    fireEvent.click(within(related).getByRole('button', { name: 'How orders work' }));
    expect(within(article()).getByRole('heading', { name: 'How orders work' })).toBeTruthy();

    fireEvent.click(within(article()).getByRole('button', { name: /Next.*How customers place orders/ }));
    expect(within(article()).getByRole('heading', { name: 'How customers place orders' })).toBeTruthy();

    fireEvent.click(within(article()).getByRole('button', { name: /Previous.*How orders work/ }));
    expect(within(article()).getByRole('heading', { name: 'How orders work' })).toBeTruthy();
  });

  it('has no next button on the last topic', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: 'Billing' }));
    expect(within(article()).queryByRole('button', { name: /^Next/ })).toBeNull();
    expect(within(article()).getByRole('link', { name: /Go to Billing/ }).getAttribute('href')).toBe('/billing');
  });

  it('filters topics by title and answer text, and shows an empty state', () => {
    renderHelp();
    const nav = screen.getByRole('navigation', { name: 'Help topics' });
    const search = screen.getByRole('searchbox', { name: 'Search help topics' });

    fireEvent.change(search, { target: { value: 'upi' } });
    const visible = within(nav).getAllByRole('listitem').map((item) => item.textContent);
    expect(visible).toEqual(['How seller-direct payments work', 'How to verify a customer payment']);

    fireEvent.change(search, { target: { value: 'zzz-nothing' } });
    expect(within(nav).getByText(/No topics match/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    const total = HELP_CATEGORIES.reduce((sum, category) => sum + category.articles.length, 0);
    expect(within(nav).getAllByRole('listitem')).toHaveLength(total);
  });

  it('restarts the welcome tour and links to support email', () => {
    renderHelp();
    fireEvent.click(screen.getByRole('button', { name: /Restart welcome tour/ }));
    expect(openOnboarding).toHaveBeenCalledWith({ reset: true, step: 0 });
    expect(notify).toHaveBeenCalledWith('Welcome tour restarted.');
    expect(screen.getByRole('link', { name: /Email support/ }).getAttribute('href')).toBe(`mailto:${LEGAL.SUPPORT_EMAIL}`);
  });

  it('asks the seller to sign in again when the shop is missing', () => {
    renderHelp(null);
    fireEvent.click(screen.getByRole('button', { name: /Restart welcome tour/ }));
    expect(openOnboarding).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Please sign in again to restart the tour.');
  });

  it('links every topic to a real dashboard page', () => {
    const routes = new Set(['/settings', '/products', '/storefront', '/orders', '/orders/new', '/customers', '/customer-wants', '/analytics', '/billing']);
    for (const category of HELP_CATEGORIES) {
      for (const item of category.articles) expect(routes.has(item.action?.to)).toBe(true);
    }
  });
});
