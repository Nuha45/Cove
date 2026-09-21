import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';
import DashboardLayout from '../layouts/DashboardLayout';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import DashboardPage from '../pages/DashboardPage';
import ProductsPage from '../pages/ProductsPage';
import OrdersPage from '../pages/OrdersPage';
import NewOrderPage from '../pages/NewOrderPage';
import OrderDetailPage from '../pages/OrderDetailPage';
import SettingsPage from '../pages/SettingsPage';
import StorefrontPage from '../pages/StorefrontPage';
import BillingPage from '../pages/BillingPage';
import MarketingPage from '../pages/MarketingPage';
import AnalyticsPage from '../pages/AnalyticsPage';

const StoreShell = lazy(() => import('../pages/store/StoreShell'));
const StoreHomePage = lazy(() => import('../pages/store/StoreHomePage'));
const StoreProductPage = lazy(() => import('../pages/store/StoreProductPage'));
const StoreCartPage = lazy(() => import('../pages/store/StoreCartPage'));
const StoreCheckoutPage = lazy(() => import('../pages/store/StoreCheckoutPage'));
const StoreConfirmationPage = lazy(() => import('../pages/store/StoreConfirmationPage'));
const StoreWantPage = lazy(() => import('../pages/store/StoreWantPage'));
const CustomersPage = lazy(() => import('../pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('../pages/CustomerDetailPage'));
const CustomerWantsPage = lazy(() => import('../pages/CustomerWantsPage'));
const CustomerWantDetailPage = lazy(() => import('../pages/CustomerWantDetailPage'));

function StoreFallback() {
  return <div className="store-status">Opening the shop...</div>;
}

function PageFallback() {
  return <div className="panel-state">Loading...</div>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/store/:slug"
        element={(
          <Suspense fallback={<StoreFallback />}>
            <StoreShell />
          </Suspense>
        )}
      >
        <Route index element={<Suspense fallback={<StoreFallback />}><StoreHomePage /></Suspense>} />
        <Route path="product/:productId" element={<Suspense fallback={<StoreFallback />}><StoreProductPage /></Suspense>} />
        <Route path="cart" element={<Suspense fallback={<StoreFallback />}><StoreCartPage /></Suspense>} />
        <Route path="checkout" element={<Suspense fallback={<StoreFallback />}><StoreCheckoutPage /></Suspense>} />
        <Route path="order/:orderNumber" element={<Suspense fallback={<StoreFallback />}><StoreConfirmationPage /></Suspense>} />
        <Route path="want" element={<Suspense fallback={<StoreFallback />}><StoreWantPage /></Suspense>} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/customers" element={<Suspense fallback={<PageFallback />}><CustomersPage /></Suspense>} />
          <Route path="/customers/:id" element={<Suspense fallback={<PageFallback />}><CustomerDetailPage /></Suspense>} />
          <Route path="/customer-wants" element={<Suspense fallback={<PageFallback />}><CustomerWantsPage /></Suspense>} />
          <Route path="/customer-wants/:id" element={<Suspense fallback={<PageFallback />}><CustomerWantDetailPage /></Suspense>} />
          <Route path="/marketing" element={<MarketingPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/storefront" element={<StorefrontPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
