import { NavLink } from 'react-router-dom';
import { ChevronDown, LogOut, ShieldCheck } from 'lucide-react';
import { navItems } from '../../routes/navItems';
import { initials } from '../../utils/display';
import CoveLogo from '../brand/CoveLogo';

export default function Sidebar({ business, businesses, user, open, onNavigate, onLogout }) {
  const canSwitchShops = Array.isArray(businesses) && businesses.length > 1;

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} id="workspace-sidebar">
      <div className="sidebar-scroll">
        <div className="brand">
          <CoveLogo />
        </div>

        <div className="business-switch">
          <div className="avatar">{initials(business?.name, 1)}</div>
          <div>
            <strong>{business?.name || 'Your business'}</strong>
            <small>{business?.category || 'Small business'}</small>
          </div>
          {canSwitchShops ? <ChevronDown size={15} aria-hidden="true" /> : null}
        </div>

        <nav aria-label="Workspace">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} onClick={onNavigate}>
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {user?.isPlatformAdmin === true ? (
          <nav aria-label="Cove Admin" className="sidebar-admin-nav">
            <NavLink to="/admin" onClick={onNavigate}>
              <ShieldCheck size={18} />
              <span>Cove Admin</span>
            </NavLink>
          </nav>
        ) : null}
      </div>

      <div className="sidebar-bottom">
        <div className="profile">
          <div className="avatar small">{initials(user?.name)}</div>
          <div>
            <strong>{user?.name || 'Owner'}</strong>
            <small>Owner</small>
          </div>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          <LogOut size={15} /> Log out
        </button>
      </div>
    </aside>
  );
}
