import { Bell, ExternalLink, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { navItems } from '../../routes/navItems';
import CoveLogo from '../brand/CoveLogo';

export default function TopBar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = navItems.find((item) => item.to === pathname);
  const label = current?.label || 'Workspace';

  return (
    <header className="topbar">
      <button className="mobile-menu" type="button" aria-label="Open menu" onClick={onMenu}>
        <Menu />
      </button>
      <div className="mobile-brand" aria-label="Cove">
        <CoveLogo size={24} />
      </div>
      <div className="crumb">
        {label === 'Dashboard' ? 'Workspace' : 'Workspace /'} <strong>{label}</strong>
      </div>
      <div className="top-actions">
        <button
          className="icon-button"
          type="button"
          aria-label="Notifications"
          title="Notifications will be added later"
        >
          <Bell size={19} />
        </button>
        <button className="store-link" type="button" onClick={() => navigate('/storefront')}>
          <ExternalLink size={15} /> View storefront
        </button>
      </div>
    </header>
  );
}
