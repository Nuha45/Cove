import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import { applyPrivateSeo, isIndexablePath } from './utils/seo';

// Storefront and product pages set their own metadata; everything else stays out of search results.
function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isIndexablePath(pathname)) applyPrivateSeo();
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteSeo />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
