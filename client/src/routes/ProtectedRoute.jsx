import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorScreen, LoadingScreen } from '../components/StatusScreen';
import { WAKING_MESSAGE } from '../utils/retry';

export default function ProtectedRoute() {
  const { status, error, waking, refresh } = useAuth();

  if (status === 'loading') return <LoadingScreen message={waking ? WAKING_MESSAGE : undefined} />;
  if (status === 'error') return <ErrorScreen message={error} onRetry={refresh} />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;

  return <Outlet />;
}
