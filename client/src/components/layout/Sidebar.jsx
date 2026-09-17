import { NavLink } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, LogOut, MessageCircle, MoreHorizontal, Sparkles } from 'lucide-react';
import { navItems } from '../../routes/navItems';
import { initials } from '../../utils/display';
import CoveLogo from '../brand/CoveLogo';

export default function Sidebar({ business, user, open, onNavigate, onNotify, onLogout }) {
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
        <div className="upgrade">
          <Sparkles size={17} />
          <strong>Make your business shine</strong>
          <p>Marketing tools will live here after your products are ready.</p>
          <NavLink to="/marketing" onClick={onNavigate}>
            Explore <ArrowUpRight size={14} />
          </NavLink>
        </div>
        <button className="help" type="button" onClick={() => onNotify('Help center will be added later.')}>
          <MessageCircle size={17} /> Help center
        </button>
        <div className="profile">
          <div className="avatar small">{initials(user?.name)}</div>
          <div>
            <strong>{user?.name || 'Owner'}</strong>
            <small>Owner</small>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Account menu"
            onClick={() => onNotify('More account options will be added later.')}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          <LogOut size={15} /> Log out
        </button>
      </div>
    </aside>
  );
}
