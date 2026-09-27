import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Usability only: the API independently rejects non-admin sessions.
export default function AdminRoute() {
  const { user } = useAuth();
  if (user?.isPlatformAdmin !== true) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
