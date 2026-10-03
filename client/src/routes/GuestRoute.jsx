import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/StatusScreen';
import { WAKING_MESSAGE } from '../utils/retry';

export default function GuestRoute() {
  const { status, waking } = useAuth();

  if (status === 'loading') return <LoadingScreen message={waking ? WAKING_MESSAGE : 'Checking your login...'} />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
