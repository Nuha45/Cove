import { Bell, ExternalLink, Menu, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { navItems } from '../../routes/navItems';
import CoveLogo from '../brand/CoveLogo';
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
        <button
          className="icon-button"
          type="button"
          aria-label="Notifications"
          title="Notifications will be added later"
        >
          <Bell size={19} />
        </button>
        {business?.slug ? (
          <a className="store-link" href={storePath} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> View storefront
          </a>
        ) : (
          <a className="store-link" href="/storefront">
            <ExternalLink size={15} /> View storefront
          </a>
        )}
      </div>
    </header>
  );
}
