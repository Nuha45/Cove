import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';
import AdminRoute from './AdminRoute';
import DashboardLayout from '../layouts/DashboardLayout';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import VerifyEmailPage from '../pages/VerifyEmailPage';
import DashboardPage from '../pages/DashboardPage';
import ProductsPage from '../pages/ProductsPage';
import OrdersPage from '../pages/OrdersPage';
import NewOrderPage from '../pages/NewOrderPage';
import OrderDetailPage from '../pages/OrderDetailPage';
import SettingsPage from '../pages/SettingsPage';
import StorefrontPage from '../pages/StorefrontPage';
import BillingPage from '../pages/BillingPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import HelpPage from '../pages/HelpPage';
import HomePage from '../pages/HomePage';

const StoreShell = lazy(() => import('../pages/store/StoreShell'));
const StoreHomePage = lazy(() => import('../pages/store/StoreHomePage'));
const StoreProductPage = lazy(() => import('../pages/store/StoreProductPage'));
const StoreCartPage = lazy(() => import('../pages/store/StoreCartPage'));
const StoreCheckoutPage = lazy(() => import('../pages/store/StoreCheckoutPage'));
const StoreConfirmationPage = lazy(() => import('../pages/store/StoreConfirmationPage'));
const StoreWantPage = lazy(() => import('../pages/store/StoreWantPage'));
const StoreWantBoardPage = lazy(() => import('../pages/store/StoreWantBoardPage'));
const CustomersPage = lazy(() => import('../pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('../pages/CustomerDetailPage'));
const CustomerWantsPage = lazy(() => import('../pages/CustomerWantsPage'));
const CustomerWantDetailPage = lazy(() => import('../pages/CustomerWantDetailPage'));
const InvoicesPage = lazy(() => import('../pages/InvoicesPage'));
const TermsPage = lazy(() => import('../pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('../pages/legal/PrivacyPage'));
const RefundPolicyPage = lazy(() => import('../pages/legal/RefundPolicyPage'));
const AdminLayout = lazy(() => import('../layouts/AdminLayout'));
const AdminOverviewPage = lazy(() => import('../pages/admin/AdminOverviewPage'));
const AdminBusinessesPage = lazy(() => import('../pages/admin/AdminBusinessesPage'));
const AdminBusinessDetailPage = lazy(() => import('../pages/admin/AdminBusinessDetailPage'));

function StoreFallback() {
  return <div className="store-status">Opening the shop...</div>;
}

function StorePageNotFound() {
  const { slug } = useParams();
  return (
    <div className="store-panel">
      <h1>Page not found</h1>
      <p>This page is not part of the shop. It may have moved or the link may be incomplete.</p>
      <Link className="primary" to={`/store/${slug}`}>Back to shop</Link>
    </div>
  );
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
      <Route path="/verify-email" element={<VerifyEmailPage />} />

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
        <Route path="want-board" element={<Suspense fallback={<StoreFallback />}><StoreWantBoardPage /></Suspense>} />
        <Route path="*" element={<StorePageNotFound />} />
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
          <Route path="/invoices" element={<Suspense fallback={<PageFallback />}><InvoicesPage /></Suspense>} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/storefront" element={<StorefrontPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route element={<AdminRoute />}>
          <Route element={<Suspense fallback={<PageFallback />}><AdminLayout /></Suspense>}>
            <Route path="/admin" element={<Suspense fallback={<PageFallback />}><AdminOverviewPage /></Suspense>} />
            <Route path="/admin/businesses" element={<Suspense fallback={<PageFallback />}><AdminBusinessesPage /></Suspense>} />
            <Route path="/admin/businesses/:id" element={<Suspense fallback={<PageFallback />}><AdminBusinessDetailPage /></Suspense>} />
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<HomePage />} />
      <Route path="/terms" element={<Suspense fallback={<PageFallback />}><TermsPage /></Suspense>} />
      <Route path="/privacy" element={<Suspense fallback={<PageFallback />}><PrivacyPage /></Suspense>} />
      <Route path="/refund-policy" element={<Suspense fallback={<PageFallback />}><RefundPolicyPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
