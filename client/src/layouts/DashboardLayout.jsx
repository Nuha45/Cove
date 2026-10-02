import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import ResendVerificationButton from '../components/layout/ResendVerificationButton';
import OnboardingModal from '../components/onboarding/OnboardingModal';
import { getErrorMessage } from '../utils/errors';
import {
  getOnboardingState,
  markOnboardingFinished,
  resetOnboarding,
  saveOnboardingState,
  shouldAutoOpenOnboarding,
} from '../utils/onboarding';
import { listProducts } from '../services/productService';
import { getBilling } from '../services/billingService';
import { copyText, storefrontUrl } from '../utils/storefront';

const OPEN_FLAG = 'cove-open-onboarding';

export default function DashboardLayout() {
  const { user, business, logout, refreshUser } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState('');
  const [activeProductCount, setActiveProductCount] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [plan, setPlan] = useState({
    loading: true, advanced: false, inTrial: false, trialEnded: false, storePaused: false, access: 'ok', key: 'pro',
  });
  const location = useLocation();
  const navigate = useNavigate();
  const businessId = business?.id;
  const emailUnverified = user?.emailVerified === false;

  // UI hint only. Plan features and the store pause are enforced on the server.
  const refreshPlan = useCallback(async () => {
    try {
      const result = await getBilling();
      setPlan({
        loading: false,
        advanced: Boolean(result.entitlements?.advanced),
        inTrial: Boolean(result.entitlements?.inTrial),
        trialEnded: Boolean(result.entitlements?.trialEnded),
        storePaused: Boolean(result.store?.paused),
        access: result.access || 'ok',
        key: result.subscription?.plan || 'pro',
      });
    } catch {
      setPlan({
        loading: false, advanced: false, inTrial: false, trialEnded: false, storePaused: false, access: 'ok', key: 'pro',
      });
    }
  }, []);

  useEffect(() => {
    if (businessId) refreshPlan();
  }, [businessId, refreshPlan]);

  // Verification can finish in another tab or on another device, so re-check when the seller returns.
  useEffect(() => {
    if (!emailUnverified) return undefined;
    function handleReturn() {
      if (document.visibilityState === 'visible') refreshUser();
    }
    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);
    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [emailUnverified, refreshUser]);

  const openOnboarding = useCallback((options = {}) => {
    if (options.reset && !businessId) return;

    if (businessId && options.reset) {
      resetOnboarding(businessId);
    }

    const nextStep = Number.isFinite(options.step)
      ? Math.max(0, Number(options.step))
      : (businessId ? getOnboardingState(businessId).step : 0);

    if (businessId) {
      saveOnboardingState(businessId, {
        step: nextStep,
        completed: false,
        dismissed: false,
      });
    }

    setOnboardingStep(nextStep);
    setOnboardingOpen(true);

    try {
      sessionStorage.removeItem(OPEN_FLAG);
    } catch {
      // ignore
    }
  }, [businessId]);

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNav) return undefined;
    const previous = document.body.style.overflow;
    document.body.classList.add('nav-open');
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('nav-open');
      document.body.style.overflow = previous;
    };
  }, [mobileNav]);

  useEffect(() => {
    if (!businessId) return undefined;
    let cancelled = false;
    listProducts({ status: 'Active', limit: 1 })
      .then((result) => {
        if (cancelled) return;
        setActiveProductCount(Number(result.total) || (result.products?.length || 0));
      })
      .catch(() => {
        if (!cancelled) setActiveProductCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId, location.pathname]);

  useEffect(() => {
    if (!businessId || activeProductCount === null || emailUnverified) return;

    let forceOpen = false;
    try {
      forceOpen = sessionStorage.getItem(OPEN_FLAG) === '1';
    } catch {
      forceOpen = false;
    }

    if (forceOpen) {
      try {
        sessionStorage.removeItem(OPEN_FLAG);
      } catch {
        // ignore
      }
      openOnboarding({ reset: true, step: 0 });
      return;
    }

    if (shouldAutoOpenOnboarding(businessId, { activeProductCount })) {
      const state = getOnboardingState(businessId);
      setOnboardingStep(state.step || 0);
      setOnboardingOpen(true);
    }
  }, [businessId, activeProductCount, emailUnverified, location.pathname, openOnboarding]);

  function notify(text) {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  }

  const handleStepChange = useCallback((nextStep) => {
    setOnboardingStep(nextStep);
    if (businessId) saveOnboardingState(businessId, { step: nextStep });
  }, [businessId]);

  function closeOnboarding() {
    if (businessId) markOnboardingFinished(businessId, 'dismissed');
    setOnboardingOpen(false);
  }

  function finishOnboarding() {
    if (businessId) markOnboardingFinished(businessId, 'completed');
    setOnboardingOpen(false);
    if (location.pathname !== '/dashboard') navigate('/dashboard');
  }

  async function copyStorefrontLink() {
    const url = storefrontUrl(business?.slug);
    if (!url) {
      notify('Your storefront link is not ready yet.');
      return;
    }
    try {
      await copyText(url);
      notify('Storefront link copied.');
    } catch {
      notify('Could not copy the link. You can select it and copy manually.');
    }
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
    <div className={`app-shell ${mobileNav ? 'nav-open' : ''}`}>
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
        onLogout={handleLogout}
      />
      <main className="main">
        <TopBar onMenu={() => setMobileNav((open) => !open)} menuOpen={mobileNav} />
        <div className="content">
          {emailUnverified ? (
            <div className="billing-callout warn plan-banner" role="status">
              <div>
                <strong>Check your email to verify your Cove account</strong>
                <p>
                  We sent a verification link to {user.email}. Please verify your email address to continue.
                  Your storefront stays closed until then.
                </p>
              </div>
              <ResendVerificationButton className="primary" onResult={notify} />
            </div>
          ) : null}
          {(plan.storePaused || plan.access === 'trial_ended') && location.pathname !== '/billing' ? (
            <div className="billing-callout warn plan-banner" role="status">
              <div>
                <strong>{plan.access === 'trial_ended' ? 'Your trial has ended' : 'Your Cove store is paused'}</strong>
                <p>
                  {plan.storePaused
                    ? 'Choose a plan to reopen your Cove store. Your products, orders and customers are safe.'
                    : 'Choose a plan to keep using Cove. Cove Basic is ₹599/month and Cove Plus is ₹899/month.'}
                </p>
              </div>
              <Link className="primary" to="/billing">View plans</Link>
            </div>
          ) : null}
          <Outlet
            context={{
              notify,
              openOnboarding,
              activeProductCount: activeProductCount ?? 0,
              plan,
              refreshPlan,
            }}
          />
        </div>
      </main>
      {toast ? (
        <div className="toast" role="status">
          <Check size={17} /> {toast}
        </div>
      ) : null}
      <OnboardingModal
        open={onboardingOpen}
        step={onboardingStep}
        business={business}
        activeProductCount={activeProductCount ?? 0}
        onStepChange={handleStepChange}
        onClose={closeOnboarding}
        onFinish={finishOnboarding}
        onCopyLink={copyStorefrontLink}
      />
    </div>
  );
}
