import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CoveLogo from '../components/brand/CoveLogo';
import { initials } from '../utils/display';

const ADMIN_NAV = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Businesses', to: '/admin/businesses', icon: Building2 },
];

function currentLabel(pathname) {
  if (pathname.startsWith('/admin/businesses/')) return 'Business';
  if (pathname.startsWith('/admin/businesses')) return 'Businesses';
  return 'Overview';
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const label = currentLabel(location.pathname);

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNav) return undefined;
    const previous = document.body.style.overflow;
    document.body.classList.add('nav-open');
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('nav-open');
      document.body.style.overflow = previous;
    };
  }, [mobileNav]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  }

  return (
    <div className={`app-shell admin-shell ${mobileNav ? 'nav-open' : ''}`}>
      {mobileNav ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="sidebar-scroll">
          <div className="brand">
            <CoveLogo />
          </div>

          <div className="business-switch admin-badge-row">
            <div className="avatar admin-avatar"><ShieldCheck size={16} /></div>
            <div>
              <strong>Cove Admin</strong>
              <small>Platform operators only</small>
            </div>
          </div>

          <nav aria-label="Admin">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileNav(false)}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <Link className="admin-back-link" to="/dashboard">
            <ArrowLeft size={15} /> Back to my shop
          </Link>
          <div className="profile">
            <div className="avatar small">{initials(user?.name)}</div>
            <div>
              <strong>{user?.name || 'Admin'}</strong>
              <small>Platform admin</small>
            </div>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            type="button"
            aria-label={mobileNav ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileNav((open) => !open)}
          >
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="mobile-brand" aria-label="Cove">
            <CoveLogo size={24} />
          </div>
          <div className="crumb">
            <span className="crumb-prefix">Cove Admin /</span>
            <strong>{label}</strong>
          </div>
          <div className="mobile-page-title">{label}</div>
          <div className="top-actions">
            <span className="admin-pill"><ShieldCheck size={14} /> Admin</span>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
