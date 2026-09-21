import { NavLink } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { navItems } from '../../routes/navItems';
import { initials } from '../../utils/display';
import CoveLogo from '../brand/CoveLogo';

export default function Sidebar({ business, user, open, onNavigate, onLogout }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-hidden={open ? undefined : undefined}>
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
          <ChevronDown size={15} />
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
