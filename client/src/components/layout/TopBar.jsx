import { ExternalLink, Menu, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navItems } from '../../routes/navItems';
import CoveLogo from '../brand/CoveLogo';
import NotificationBell from './NotificationBell';
import { storefrontPath } from '../../utils/storefront';

export default function TopBar({ onMenu, menuOpen = false }) {
  const { pathname } = useLocation();
  const { business } = useAuth();
  const current = navItems.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  const label = current?.label || 'Workspace';
  const storePath = business?.slug ? storefrontPath(business.slug) : '/storefront';

  return (
    <header className="topbar">
      <button className="mobile-menu" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={onMenu}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      <div className="mobile-brand" aria-label="Cove">
        <CoveLogo size={24} />
      </div>
      <div className="crumb">
        <span className="crumb-prefix">Workspace /</span>
        <strong>{label}</strong>
      </div>
      <div className="mobile-page-title">{label}</div>
      <div className="top-actions">
        <NotificationBell />
        {business?.slug ? (
          <a className="store-link" href={storePath} target="_blank" rel="noreferrer" aria-label="View storefront">
            <ExternalLink size={15} aria-hidden="true" />
            <span className="store-link-full">View storefront</span>
            <span className="store-link-short" aria-hidden="true">Store</span>
          </a>
        ) : (
          <a className="store-link" href="/storefront" aria-label="View storefront">
            <ExternalLink size={15} aria-hidden="true" />
            <span className="store-link-full">View storefront</span>
            <span className="store-link-short" aria-hidden="true">Store</span>
          </a>
        )}
      </div>
    </header>
  );
}
