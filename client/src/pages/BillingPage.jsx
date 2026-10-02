import { useEffect, useState } from 'react';
import { Check, CreditCard } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import { cancelSubscription, getBilling, startSubscription } from '../services/billingService';
import { formatEyebrowDate, formatOrderDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import {
  BILLING_STATUS_LABEL,
  BILLING_STATUS_TONE,
  PLAN_DETAILS,
  loadRazorpayCheckout,
} from '../utils/billing';

export default function BillingPage() {
  const { notify, refreshPlan } = useOutletContext();
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

  async function afterChange() {
    await load();
    refreshPlan?.();
  }

  async function handleChoose(planKey) {
    setBusy(planKey);
    setActionError('');
    try {
      const result = await startSubscription(planKey);

      if (result.planChange) {
        notify(result.planChange.message);
        await afterChange();
        return;
      }

      setData((current) => ({ ...current, subscription: result.subscription }));
      if (!result.checkout?.keyId || !result.checkout?.subscriptionId) {
        throw new Error('Checkout is not available right now. Please try again in a few minutes.');
      }

      const Razorpay = await loadRazorpayCheckout();
      const checkout = new Razorpay({
        key: result.checkout.keyId,
        subscription_id: result.checkout.subscriptionId,
        name: 'Cove',
        description: `${result.checkout.planName} · ₹${result.checkout.amount}/month`,
        theme: { color: '#c45c26' },
        handler() {
          notify('Payment submitted. Your plan updates when Cove confirms it.');
          afterChange();
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
    const planName = data?.plan?.name || 'your plan';
    const current = data?.subscription?.status;
    const question = current === 'active'
      ? `Cancel ${planName}? It will not renew, and you keep it until the end of the current billing period.`
      : current === 'trialing'
        ? `Cancel your ${planName} plan choice? Nothing has been charged and your free trial continues.`
        : `Cancel ${planName}? You can subscribe again later.`;
    if (!window.confirm(question)) return;
    setBusy('cancel');
    setActionError('');
    try {
      const result = await cancelSubscription();
      setData((current) => ({ ...current, subscription: result.subscription }));
      notify(result.message || 'Subscription cancelled.');
      refreshPlan?.();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  const subscription = data?.subscription;
  const currentPlan = data?.plan;
  const plans = data?.plans || [];
  const periodOver = Boolean(
    subscription?.cancelAtPeriodEnd
    && subscription?.currentPeriodEndAt
    && new Date(subscription.currentPeriodEndAt) <= new Date()
  );
  const status = subscription?.status === 'active' && periodOver ? 'cancelled' : subscription?.status || 'incomplete';
  const statusLabel = BILLING_STATUS_LABEL[status] || status;
  const inTrial = Boolean(data?.trial?.active);
  const trialEnded = Boolean(data?.trial?.ended);
  const storePaused = Boolean(data?.store?.paused);
  const billingExempt = data?.billingExempt === true;
  const trialEndedUnpaid = !inTrial && data?.access === 'trial_ended';
  const trialDays = data?.trial?.days || 7;
  const hasProvider = Boolean(subscription?.hasProviderSubscription);
  const isPaidActive = status === 'active' && hasProvider;
  const endingAtPeriodEnd = isPaidActive && subscription?.cancelAtPeriodEnd;
  const scheduledPlan = isPaidActive ? subscription?.scheduledPlan : '';
  const scheduledPlanName = plans.find((plan) => plan.key === scheduledPlan)?.name;
  const showCancel = hasProvider && status !== 'cancelled' && !subscription?.cancelAtPeriodEnd;
  const advancedIncluded = Boolean(data?.entitlements?.advanced);
  const periodEnd = subscription?.currentPeriodEndAt ? formatOrderDate(subscription.currentPeriodEndAt) : '';

  function planAction(plan) {
    const isCurrent = subscription?.plan === plan.key;
    if (endingAtPeriodEnd) {
      return isCurrent
        ? { label: 'Current plan', disabled: true }
        : { label: `Choose ${plan.name}`, disabled: true, note: 'Available after your current plan ends.' };
    }
    if (isPaidActive && isCurrent && scheduledPlan) return { label: `Keep ${plan.name}`, disabled: false };
    if (isPaidActive && scheduledPlan === plan.key) return { label: 'Starts next cycle', disabled: true };
    if (isPaidActive && isCurrent) return { label: 'Current plan', disabled: true };
    if (!plan.checkoutConfigured) {
      return { label: 'Not available yet', disabled: true, note: 'Payments are currently being configured.' };
    }
    if (status === 'past_due' && hasProvider) {
      return isCurrent
        ? { label: 'Complete payment', disabled: false }
        : { label: `Choose ${plan.name}`, disabled: true, note: 'Resolve the pending payment first.' };
    }
    if (isPaidActive) {
      return { label: plan.key === 'advanced' ? 'Upgrade to Cove Plus' : 'Switch to Cove Basic', disabled: false };
    }
    if (hasProvider && isCurrent && inTrial) {
      return { label: 'Continue checkout', disabled: false };
    }
    return { label: `Choose ${plan.name}`, disabled: false };
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Billing"
        subtitle="Your Cove subscription. This is separate from payments your customers make to you."
      />

      {loadState === 'loading' ? <section className="card panel-state">Loading billing...</section> : null}

      {loadState === 'error' ? (
        <section className="card panel-state">
          <p className="form-error">{loadError}</p>
          <button className="secondary" type="button" onClick={load}>Try again</button>
        </section>
      ) : null}

      {loadState === 'ready' && currentPlan && subscription ? (
        <>
          <section className="card billing-plan-card billing-status-card">
            <div className="billing-plan-head">
              <div>
                <p className="eyebrow">YOUR SUBSCRIPTION</p>
                {inTrial ? (
                  <>
                    <h2>{trialDays}-day free trial</h2>
                    <p className="billing-price">Free<span> until {formatOrderDate(subscription.trialEndAt)}</span></p>
                  </>
                ) : !hasProvider ? (
                  <>
                    <h2>No active plan</h2>
                    <p className="muted">Choose Cove Basic or Cove Plus below.</p>
                  </>
                ) : (
                  <>
                    <h2>{currentPlan.name}</h2>
                    <p className="billing-price">
                      {formatPrice(currentPlan.amount, currentPlan.currency)}
                      <span>/month</span>
                    </p>
                  </>
                )}
              </div>
              <Badge tone={BILLING_STATUS_TONE[status] || 'neutral'}>{statusLabel}</Badge>
            </div>

            {inTrial ? (
              <div className="billing-callout">
                <strong>{trialDays}-day free trial</strong>
                <p>
                  Every Cove Plus feature is unlocked until {formatOrderDate(subscription.trialEndAt)}.
                  {hasProvider
                    ? ` Your ${currentPlan.name} plan starts when the trial ends.`
                    : ' After that, choose Cove Basic or Cove Plus to keep your store open. Nothing is charged unless you choose a plan.'}
                </p>
              </div>
            ) : null}

            {trialEndedUnpaid ? (
              <div className="billing-callout warn">
                <strong>Your trial has ended</strong>
                <p>
                  Choose a plan to reopen your Cove store.
                  {storePaused
                    ? ' Your storefront is paused until then. Your products, orders and customers are safe.'
                    : ' Cove Plus features are locked until a plan is active.'}
                </p>
              </div>
            ) : null}

            {storePaused && !trialEndedUnpaid ? (
              <div className="billing-callout warn">
                <strong>Your Cove store is paused</strong>
                <p>Choose a plan to reopen your Cove store. Your products, orders and customers are safe.</p>
              </div>
            ) : null}

            {billingExempt ? (
              <div className="billing-callout">
                <strong>Platform admin account</strong>
                <p>Cove billing is not required for this shop while you are a platform admin. Your store stays open without a plan.</p>
              </div>
            ) : null}

            {status === 'incomplete' && !billingExempt && !trialEnded && !trialEndedUnpaid && !storePaused ? (
              <div className="billing-callout">
                <strong>Payment required</strong>
                <p>Choose a plan below. Your plan becomes active as soon as the payment is confirmed.</p>
              </div>
            ) : null}

            {endingAtPeriodEnd ? (
              <div className="billing-callout">
                <strong>Your subscription will not renew</strong>
                <p>
                  You keep {currentPlan.name}{periodEnd ? ` until ${periodEnd}` : ' until the end of the current billing period'}.
                  You can choose a plan again after that.
                </p>
              </div>
            ) : null}

            {scheduledPlanName ? (
              <div className="billing-callout">
                <strong>Switching to {scheduledPlanName}</strong>
                <p>
                  You keep {currentPlan.name}{periodEnd ? ` until ${periodEnd}` : ' until the end of the current billing period'},
                  then {scheduledPlanName} starts with the next cycle.
                </p>
              </div>
            ) : null}

            {status === 'past_due' ? (
              <div className="billing-callout warn">
                <strong>Payment due</strong>
                <p>Your last monthly payment did not go through. Choose Complete payment below to update your payment details.</p>
              </div>
            ) : null}

            {status === 'halted' ? (
              <div className="billing-callout warn">
                <strong>Payment failed</strong>
                <p>We could not collect your monthly payment after several tries, so automatic renewal has stopped. Choose a plan below to start again.</p>
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
                <dt>{endingAtPeriodEnd ? 'Access until' : 'Next billing'}</dt>
                <dd>
                  {status === 'active' && periodEnd
                    ? periodEnd
                    : inTrial && hasProvider && subscription.trialEndAt
                      ? formatOrderDate(subscription.trialEndAt)
                      : '—'}
                </dd>
              </div>
              <div>
                <dt>Cove Plus features</dt>
                <dd>{advancedIncluded ? 'Included' : 'Not included'}</dd>
              </div>
            </dl>

            {actionError ? <p className="form-error">{actionError}</p> : null}

            {showCancel ? (
              <div className="billing-actions">
                <button className="secondary" type="button" disabled={Boolean(busy)} onClick={handleCancel}>
                  {busy === 'cancel' ? 'Cancelling...' : 'Cancel subscription'}
                </button>
              </div>
            ) : null}
          </section>

          <div className="plan-grid">
            {plans.map((plan) => {
              const details = PLAN_DETAILS[plan.key];
              const action = planAction(plan);
              const isCurrent = subscription.plan === plan.key && (isPaidActive || status === 'past_due');
              return (
                <section
                  key={plan.key}
                  className={`card plan-card${plan.key === 'advanced' ? ' featured' : ''}${isCurrent ? ' current' : ''}`}
                  aria-labelledby={`plan-${plan.key}`}
                >
                  <div className="plan-card-head">
                    <div>
                      <h2 id={`plan-${plan.key}`}>{plan.name}</h2>
                      <p className="billing-price">
                        {formatPrice(plan.amount, plan.currency)}
                        <span>/month</span>
                      </p>
                    </div>
                    {plan.key === 'advanced' ? <Badge tone="orange">Recommended</Badge> : null}
                  </div>
                  <p className="muted plan-card-lead">{details?.lead}</p>
                  <ul className="plan-features">
                    {(details?.features || []).map((feature) => (
                      <li key={feature}>
                        <Check size={15} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className={plan.key === 'advanced' ? 'primary' : 'secondary'}
                    type="button"
                    disabled={Boolean(busy) || action.disabled}
                    onClick={() => handleChoose(plan.key)}
                  >
                    {plan.key === 'advanced' && !action.disabled ? <CreditCard size={16} /> : null}
                    {busy === plan.key ? 'Starting...' : action.label}
                  </button>
                  {action.note ? <p className="muted plan-card-note">{action.note}</p> : null}
                </section>
              );
            })}
          </div>

          <p className="muted billing-footnote">
            Nothing is charged when the free trial ends unless you choose a plan. An upgrade to Cove Plus takes effect
            according to the applicable Razorpay subscription and billing flow. Moving from Cove Plus to Cove Basic takes
            effect at the end of the current billing cycle. Cancelling stops the next renewal; you keep your plan until
            the paid period ends. Customer payments to your shop are never part of this page. See the{' '}
            <Link to="/refund-policy">Refund &amp; Cancellation Policy</Link> and{' '}
            <Link to="/terms">Terms of Service</Link>.
          </p>
        </>
      ) : null}
    </>
  );
}
