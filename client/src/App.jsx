import { useEffect } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import ErrorBoundary from './components/ui/ErrorBoundary';
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
    <ErrorBoundary
      title="Application error"
      message="Something went wrong loading Cove. Please reload to try again."
    >
      <BrowserRouter>
        <RouteSeo />
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

