import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorScreen, LoadingScreen } from '../components/StatusScreen';

export default function ProtectedRoute() {
  const { status, error, refresh } = useAuth();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <ErrorScreen message={error} onRetry={refresh} />;
  if (status !== 'authenticated') return <Navigate to="/login" replace />;

  return <Outlet />;
}
