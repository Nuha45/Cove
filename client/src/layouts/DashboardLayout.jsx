import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { getErrorMessage } from '../utils/errors';

export default function DashboardLayout() {
  const { user, business, logout } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  function notify(text) {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  }

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      notify(getErrorMessage(err));
    }
  }

  return (
    <div className="app-shell">
      {mobileNav ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <Sidebar
        business={business}
        user={user}
        open={mobileNav}
        onNavigate={() => setMobileNav(false)}
        onNotify={notify}
        onLogout={handleLogout}
      />
      <main className="main">
        <TopBar onMenu={() => setMobileNav((open) => !open)} />
        <div className="content">
          <Outlet context={{ notify }} />
        </div>
      </main>
      {toast ? (
        <div className="toast">
          <Check size={17} /> {toast}
        </div>
      ) : null}
    </div>
  );
}
