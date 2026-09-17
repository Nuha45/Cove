import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import { cancelSubscription, getBilling, startSubscription } from '../services/billingService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { BILLING_STATUS_LABEL, BILLING_STATUS_TONE, loadRazorpayCheckout } from '../utils/billing';

export default function BillingPage() {
  const { notify } = useOutletContext();
  const [data, setData] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoadState('loading');
    setLoadError('');
    try {
      const result = await getBilling();
      setData(result);
      setLoadState('ready');
    } catch (err) {
      setLoadError(getErrorMessage(err));
      setLoadState('error');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubscribe() {
    setBusy('subscribe');
    setActionError('');
    try {
      const result = await startSubscription();
      setData((current) => ({
        ...current,
        subscription: result.subscription,
        checkout: {
          ...(current?.checkout || {}),
          keyId: result.checkout.keyId,
          configured: true,
        },
      }));

      if (!result.checkout?.keyId || !result.checkout?.subscriptionId) {
        throw new Error('Checkout is not ready yet. Check Razorpay configuration.');
      }

      const Razorpay = await loadRazorpayCheckout();
      const checkout = new Razorpay({
        key: result.checkout.keyId,
        subscription_id: result.checkout.subscriptionId,
        name: 'Cove',
        description: `${result.checkout.planName} · ₹${result.checkout.amount}/month after trial`,
        theme: { color: '#c45c26' },
        handler() {
          notify('Payment submitted. Your plan updates when Cove confirms it.');
          load();
        },
        modal: {
          ondismiss() {
            notify('Checkout closed. You can continue anytime.');
          },
        },
      });
      checkout.open();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel Cove Pro? You can subscribe again later.')) return;
    setBusy('cancel');
    setActionError('');
    try {
      const result = await cancelSubscription();
      setData((current) => ({ ...current, subscription: result.subscription }));
      notify(result.message || 'Subscription cancelled.');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const subscription = data?.subscription;
  const plan = data?.plan;
  const status = subscription?.status || 'incomplete';
  const statusLabel = BILLING_STATUS_LABEL[status] || status;
  const inTrial = status === 'trialing';
  const canStartCheckout = status !== 'active';
  const showCancel = subscription?.hasProviderSubscription && status !== 'cancelled';

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Billing"
        subtitle="Cove Pro keeps your shop running. This is your SaaS subscription with Cove — not customer checkout."
      />

      {loadState === 'loading' ? <section className="card panel-state">Loading billing...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <button className="secondary" type="button" onClick={load}>Try again</button>
        </section>
      ) : null}

      {loadState === 'ready' && plan && subscription ? (
        <div className="billing-layout">
          <section className="card billing-plan-card">
            <div className="billing-plan-head">
              <div>
                <p className="eyebrow">COVE SAAS</p>
                <h2>{plan.name}</h2>
                <p className="billing-price">
                  {formatPrice(plan.amount, plan.currency)}
                  <span>/month</span>
                </p>
              </div>
              <Badge tone={BILLING_STATUS_TONE[status] || 'neutral'}>{statusLabel}</Badge>
            </div>

            {inTrial ? (
              <div className="billing-callout">
                <strong>30 days free</strong>
                <p>₹599/month after your trial. Your trial ends {formatOrderDate(subscription.trialEndAt)}.</p>
              </div>
            ) : null}

            {status === 'incomplete' ? (
              <div className="billing-callout">
                <strong>Payment required</strong>
                <p>Start Cove Pro to keep billing details ready. Checkout confirms on the server — not in the browser alone.</p>
              </div>
            ) : null}

            {status === 'past_due' ? (
              <div className="billing-callout warn">
                <strong>Past due</strong>
                <p>A recurring payment needs attention. Update payment details in Razorpay Checkout when prompted.</p>
              </div>
            ) : null}

            {status === 'halted' ? (
              <div className="billing-callout warn">
                <strong>Halted</strong>
                <p>Automatic charges stopped after failed retries. Subscribe again or update the card with Razorpay.</p>
              </div>
            ) : null}

            <dl className="detail-list billing-details">
              <div>
                <dt>Status</dt>
                <dd>{statusLabel}</dd>
              </div>
              <div>
                <dt>Trial ends</dt>
                <dd>{subscription.trialEndAt ? formatOrderDate(subscription.trialEndAt) : '—'}</dd>
              </div>
              <div>
                <dt>Current period</dt>
                <dd>
                  {subscription.currentPeriodStartAt
                    ? `${formatOrderDate(subscription.currentPeriodStartAt)} – ${formatOrderDate(subscription.currentPeriodEndAt)}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Next billing</dt>
                <dd>
                  {status === 'active' && subscription.currentPeriodEndAt
                    ? formatOrderDate(subscription.currentPeriodEndAt)
                    : inTrial && subscription.trialEndAt
                      ? formatOrderDate(subscription.trialEndAt)
                      : '—'}
                </dd>
              </div>
            </dl>

            {actionError ? <p className="form-error">{actionError}</p> : null}

            <div className="billing-actions">
              {canStartCheckout ? (
                <button className="primary" type="button" disabled={Boolean(busy)} onClick={handleSubscribe}>
                  <CreditCard size={16} />
                  {busy === 'subscribe' ? 'Starting checkout...' : inTrial ? 'Add payment method' : 'Subscribe to Cove Pro'}
                </button>
              ) : null}
              {showCancel ? (
                <button className="secondary" type="button" disabled={Boolean(busy)} onClick={handleCancel}>
                  {busy === 'cancel' ? 'Cancelling...' : 'Cancel subscription'}
                </button>
              ) : null}
            </div>

            {!data.checkout?.configured ? (
              <p className="muted">Razorpay is not fully configured on the server yet. You can still view your trial status.</p>
            ) : null}
          </section>

          <aside className="card billing-side-card">
            <h2>What you get</h2>
            <ul className="billing-bullets">
              <li>Products, orders, customers, and storefront</li>
              <li>Customer wants / demand capture</li>
              <li>Business settings and delivery controls</li>
            </ul>
            <p className="muted">
              Customer payments to your shop are separate and not part of this phase.
              This page is only for your Cove subscription.
            </p>
          </aside>
        </div>
      ) : null}
    </>
  );
}
