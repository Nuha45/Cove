import { useEffect, useId, useRef } from 'react';
import { ArrowRight, CheckCircle2, Copy, ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isShopSetupComplete } from '../../utils/onboarding';
import { storefrontPath, storefrontUrl } from '../../utils/storefront';

const FLOW = ['Create your shop', 'Add products', 'Share your storefront', 'Receive orders', 'Manage your business'];
const ORDER_FLOW = ['Customer', 'Storefront', 'Checkout', 'Order', 'Your dashboard'];

export default function OnboardingModal({
  open,
  step,
  business,
  activeProductCount = 0,
  onStepChange,
  onClose,
  onFinish,
  onCopyLink,
}) {
  const titleId = useId();
  const closeRef = useRef(null);
  const shopReady = isShopSetupComplete(business);
  const productsReady = Number(activeProductCount) > 0;
  const slug = business?.slug || '';
  const url = storefrontUrl(slug);
  const path = storefrontPath(slug);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const progress = `${step + 1} of ${5}`;

  return (
    <div className="onboarding-overlay" role="presentation" onClick={onClose}>
      <div
        className="onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="onboarding-modal-top">
          <p className="eyebrow">Step {progress}</p>
          <button
            ref={closeRef}
            className="onboarding-close"
            type="button"
            aria-label="Close onboarding"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="onboarding-progress" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <span key={index} className={index <= step ? 'active' : ''} />
          ))}
        </div>

        {step === 0 ? (
          <section className="onboarding-step">
            <h2 id={titleId}>Welcome to Cove</h2>
            <p>
              Your simple online storefront for managing products, orders, customers, and more.
            </p>
            <ol className="onboarding-flow">
              {FLOW.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <div className="onboarding-actions">
              <button className="primary" type="button" onClick={() => onStepChange(1)}>
                Let’s get started <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="onboarding-step">
            <h2 id={titleId}>Set up your shop</h2>
            <p>
              Add your shop details, logo, delivery options, and payment preferences so customers know how to buy from you.
            </p>
            {shopReady ? (
              <p className="onboarding-done">
                <CheckCircle2 size={16} aria-hidden="true" /> Your shop details already look ready.
              </p>
            ) : null}
            <div className="onboarding-actions">
              <Link className="primary" to="/settings?tab=profile" onClick={onClose}>
                Set up my shop
              </Link>
              <Link className="secondary" to="/settings?tab=payments" onClick={onClose}>
                Set up payments
              </Link>
              <button className="secondary" type="button" onClick={() => onStepChange(2)}>
                Next
              </button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="onboarding-step">
            <h2 id={titleId}>Add your products</h2>
            <p>
              Add the products you sell. Customers will see these on your public storefront.
            </p>
            {productsReady ? (
              <p className="onboarding-done">
                <CheckCircle2 size={16} aria-hidden="true" /> You already have products listed.
              </p>
            ) : null}
            <div className="onboarding-actions">
              <Link className="primary" to="/products" state={{ add: true }} onClick={onClose}>
                Add a product
              </Link>
              <button className="secondary" type="button" onClick={() => onStepChange(3)}>
                Next
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="onboarding-step">
            <h2 id={titleId}>Share your storefront</h2>
            <p>
              Your storefront is your online shop. Share your link on Instagram, WhatsApp, or anywhere your customers find you.
            </p>
            {slug ? (
              <div className="onboarding-link-box">
                <input readOnly value={url || path} aria-label="Your storefront link" />
                <div className="onboarding-link-actions">
                  <button className="secondary" type="button" onClick={onCopyLink}>
                    <Copy size={15} aria-hidden="true" /> Copy link
                  </button>
                  <a className="secondary" href={path} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} aria-hidden="true" /> Open store
                  </a>
                </div>
              </div>
            ) : (
              <p className="muted">Your storefront link will appear here once your shop slug is ready in Settings.</p>
            )}
            <div className="onboarding-actions">
              <Link className="primary" to="/storefront" onClick={onClose}>
                Go to storefront
              </Link>
              <button className="secondary" type="button" onClick={() => onStepChange(4)}>
                Next
              </button>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="onboarding-step">
            <h2 id={titleId}>Receive and manage orders</h2>
            <p>
              When customers order through your storefront, Cove automatically creates the order in your dashboard. You can then manage the order from here.
            </p>
            <ol className="onboarding-flow compact">
              {ORDER_FLOW.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <div className="onboarding-actions">
              <button className="primary" type="button" onClick={onFinish}>
                Go to my dashboard
              </button>
            </div>
          </section>
        ) : null}

        <div className="onboarding-footer">
          {step > 0 ? (
            <button className="text-button" type="button" onClick={() => onStepChange(step - 1)}>
              Back
            </button>
          ) : <span />}
          <button className="text-button" type="button" onClick={onClose}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
