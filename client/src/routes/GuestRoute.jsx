import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingScreen } from '../components/StatusScreen';

export default function GuestRoute() {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingScreen message="Checking your login..." />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
