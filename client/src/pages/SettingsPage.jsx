import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Building2,
  Copy,
  CreditCard,
  ExternalLink,
  Info,
  Store,
  Trash2,
  Truck,
  Upload,
  User,
} from 'lucide-react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import PasswordField from '../components/ui/PasswordField';
import ResendVerificationButton from '../components/layout/ResendVerificationButton';
import PaymentCurrencyNote, { PaymentCurrencyInfo } from '../components/settings/PaymentCurrencyNote';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessService';
import { changePassword } from '../services/authService';
import CategoryField from '../components/ui/CategoryField';
import DeliveryEstimate from '../components/storefront/DeliveryEstimate';
import { categoryError } from '../utils/categories';
import {
  DELIVERY_ESTIMATE_NOTE_MAX,
  DELIVERY_ESTIMATE_OPTIONS,
  previewDeliveryEstimate,
} from '../utils/deliveryEstimate';
import { CURRENCIES } from '../utils/currencies';
import { formatEyebrowDate, formatPrice, initials } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { prepareLogoImage, prepareQrImage } from '../utils/images';
import { mediaUrl } from '../utils/media';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';
import { buildUpiPayUri, isValidUpiId, upiQrDataUrl } from '../utils/upi';

const tabs = [
  'Seller Profile',
  'Business Profile',
  'Storefront',
  'Ordering & Delivery',
  'Customer payments',
  'Notifications',
];

const DEFAULT_TAB = 'Business Profile';

const TAB_ICONS = {
  'Seller Profile': User,
  'Business Profile': Building2,
  'Storefront': Store,
  'Ordering & Delivery': Truck,
  'Customer payments': CreditCard,
  Notifications: Bell,
};

const TAB_ALIASES = {
  profile: 'Business Profile',
  'business-profile': 'Business Profile',
  'business profile': 'Business Profile',
  'seller-profile': 'Seller Profile',
  storefront: 'Storefront',
  ordering: 'Ordering & Delivery',
  delivery: 'Ordering & Delivery',
  'ordering-delivery': 'Ordering & Delivery',
  payments: 'Customer payments',
  payment: 'Customer payments',
  'customer-payments': 'Customer payments',
  'customer payments': 'Customer payments',
  notifications: 'Notifications',
};

function tabFromSearch(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return null;
  if (tabs.includes(value)) return value;
  return TAB_ALIASES[key] || null;
}

const emptyForm = {
  name: '',
  slug: '',
  category: 'Jewelry & Accessories',
  description: '',
  phone: '',
  email: '',
  city: '',
  logo: '',
  currency: 'INR',
  pickupEnabled: true,
  deliveryEnabled: true,
  deliveryFee: '0',
  deliveryEstimateEnabled: false,
  deliveryEstimate: '2_3_days',
  deliveryEstimateNote: '',
  storefrontActive: true,
  paymentQrEnabled: false,
  paymentLinkEnabled: false,
  paymentInstructionsEnabled: false,
  payOnPickupEnabled: true,
  cashOnDeliveryEnabled: false,
  paymentLink: '',
  paymentQrImage: '',
  paymentUpiId: '',
  paymentInstructions: '',
  emailNewOrders: true,
  emailPayments: true,
  emailCustomerWants: true,
  emailLowStock: true,
  emailWeeklyReport: true,
  emailOrderConfirmation: true,
  emailOrderUpdates: true,
  lowStockThreshold: '5',
};

const emptyPasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };

function passwordErrorsFor(values) {
  const next = {};
  if (!values.currentPassword) next.currentPassword = 'Please enter your current password.';
  const { newPassword } = values;
  if (newPassword.length < 8 || newPassword.length > 72 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    next.newPassword = 'Use 8 to 72 characters, including a letter and a number.';
  } else if (newPassword === values.currentPassword) {
    next.newPassword = 'Choose a password different from your current one.';
  }
  if (!values.confirmPassword) {
    next.confirmPassword = 'Please confirm your new password.';
  } else if (values.confirmPassword !== newPassword) {
    next.confirmPassword = 'Passwords do not match.';
  }
  return next;
}

// Built only from the plan state the dashboard already loaded; null until it has, or if loading failed.
function sellerPlanSummary(plan, user) {
  if (plan?.loading !== false || plan.error) return null;
  if (user?.isPlatformAdmin) {
    return { name: 'No plan needed', badge: { tone: 'neutral', label: 'Cove admin' }, text: 'Cove billing does not apply to this shop.' };
  }
  const name = plan.key === 'advanced' ? 'Cove Plus' : 'Cove Basic';
  if (plan.storePaused) {
    return { name, badge: { tone: 'red', label: 'Store paused' }, text: 'Choose a plan in Billing to reopen your store.' };
  }
  if (plan.trialEnded || plan.access === 'trial_ended') {
    return { name: 'No active plan', badge: { tone: 'orange', label: 'Trial ended' }, text: 'Choose Cove Basic or Cove Plus to keep using Cove.' };
  }
  if (plan.inTrial) {
    return { name: 'Free trial', badge: { tone: 'blue', label: 'Trial' }, text: 'Cove Plus features are included during your trial.' };
  }
  return { name, badge: null, text: plan.advanced ? 'Includes all Cove Plus features.' : 'Everything you need to run your shop.' };
}

function toForm(business) {
  return {
    name: business?.name || '',
    slug: business?.slug || '',
    category: business?.category || 'Jewelry & Accessories',
    description: business?.description || '',
    phone: business?.phone || '',
    email: business?.email || '',
    city: business?.city || '',
    logo: business?.logo || '',
    currency: business?.currency || 'INR',
    pickupEnabled: business?.pickupEnabled !== false,
    deliveryEnabled: business?.deliveryEnabled !== false,
    deliveryFee: String(business?.deliveryFee ?? 0),
    deliveryEstimateEnabled: Boolean(business?.deliveryEstimateEnabled),
    deliveryEstimate: business?.deliveryEstimate || '2_3_days',
    deliveryEstimateNote: business?.deliveryEstimateNote || '',
    storefrontActive: business?.storefrontActive !== false,
    paymentQrEnabled: Boolean(business?.paymentQrEnabled),
    paymentLinkEnabled: Boolean(business?.paymentLinkEnabled),
    paymentInstructionsEnabled: Boolean(business?.paymentInstructionsEnabled),
    payOnPickupEnabled: business?.payOnPickupEnabled !== false,
    cashOnDeliveryEnabled: Boolean(business?.cashOnDeliveryEnabled),
    paymentLink: business?.paymentLink || '',
    paymentQrImage: business?.paymentQrImage || '',
    paymentUpiId: business?.paymentUpiId || '',
    paymentInstructions: business?.paymentInstructions || '',
    emailNewOrders: business?.emailNewOrders !== false,
    emailPayments: business?.emailPayments !== false,
    emailCustomerWants: business?.emailCustomerWants !== false,
    emailLowStock: business?.emailLowStock !== false,
    emailWeeklyReport: business?.emailWeeklyReport !== false,
    emailOrderConfirmation: business?.emailOrderConfirmation !== false,
    emailOrderUpdates: business?.emailOrderUpdates !== false,
    lowStockThreshold: String(business?.lowStockThreshold ?? 5),
  };
}

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const { notify, plan } = useOutletContext();
  const advanced = Boolean(plan?.advanced);
  const [searchParams] = useSearchParams();
  const fileInput = useRef(null);
  const qrInput = useRef(null);
  const [tab, setTab] = useState(() => tabFromSearch(searchParams.get('tab')) || DEFAULT_TAB);
  const [form, setForm] = useState(emptyForm);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [qrError, setQrError] = useState('');
  const [upiPreviewQr, setUpiPreviewQr] = useState('');
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const sellerProfile = tab === 'Seller Profile';
  const planSummary = sellerPlanSummary(plan, user);

  useEffect(() => {
    const nextTab = tabFromSearch(searchParams.get('tab'));
    if (nextTab) setTab(nextTab);
  }, [searchParams]);

  const sampleUpiUri = useMemo(() => {
    if (form.currency !== 'INR' || !isValidUpiId(form.paymentUpiId)) return '';
    return buildUpiPayUri({
      upiId: form.paymentUpiId,
      payeeName: form.name || 'Shop',
      amount: 100,
      currency: 'INR',
      transactionNote: 'ORDER-SAMPLE',
    });
  }, [form.currency, form.paymentUpiId, form.name]);

  useEffect(() => {
    let cancelled = false;
    async function preview() {
      if (!sampleUpiUri) {
        if (!cancelled) setUpiPreviewQr('');
        return;
      }
      const dataUrl = await upiQrDataUrl(sampleUpiUri);
      if (!cancelled) setUpiPreviewQr(dataUrl);
    }
    preview();
    return () => {
      cancelled = true;
    };
  }, [sampleUpiUri]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await getBusinessSettings();
        if (cancelled) return;
        setForm(toForm(result.business));
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err));
        setLoadState('error');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const publicUrl = storefrontUrl(form.slug);
  const publicPath = storefrontPath(form.slug);

  function update(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function handleCopy() {
    if (!publicUrl) return;
    try {
      await copyText(publicUrl);
      notify('Storefront link copied.');
    } catch {
      notify('Could not copy the link. You can select it and copy manually.');
    }
  }

  async function onLogoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setLogoError('');
    if (!file) return;
    try {
      const logo = await prepareLogoImage(file);
      setForm((current) => ({ ...current, logo }));
    } catch (err) {
      setLogoError(err.message);
    }
  }

  async function onQrSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setQrError('');
    if (!file) return;
    try {
      const paymentQrImage = await prepareQrImage(file);
      setForm((current) => ({ ...current, paymentQrImage }));
    } catch (err) {
      setQrError(err.message);
    }
  }

  function clientErrors() {
    const next = {};
    if (form.name.trim().length < 2) next.name = 'Please enter your business name.';
    const category = categoryError(form.category);
    if (category) next.category = category;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim().toLowerCase())) {
      next.slug = 'Use lowercase letters, numbers, and hyphens only.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Please enter a valid email.';
    }
    if (form.phone.trim() && !/^[+0-9][0-9\s()-]{6,19}$/.test(form.phone.trim())) {
      next.phone = 'Please enter a valid phone number.';
    }
    const fee = Number(form.deliveryFee);
    if (!Number.isFinite(fee) || fee < 0) next.deliveryFee = 'Delivery fee cannot be negative.';
    if (form.deliveryEstimateNote.trim().length > DELIVERY_ESTIMATE_NOTE_MAX) {
      next.deliveryEstimateNote = `Keep the delivery note under ${DELIVERY_ESTIMATE_NOTE_MAX} characters.`;
    } else if (form.deliveryEstimateEnabled && form.deliveryEstimate === 'custom' && !form.deliveryEstimateNote.trim()) {
      next.deliveryEstimateNote = 'Add your custom delivery message, or choose a standard estimate.';
    }
    if (form.paymentLinkEnabled && form.paymentLink.trim()) {
      try {
        const url = new URL(form.paymentLink.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
          next.paymentLink = 'Please enter a valid payment link starting with https://';
        }
      } catch {
        next.paymentLink = 'Please enter a valid payment link starting with https://';
      }
    }
    if (form.paymentQrEnabled && !form.paymentQrImage && !isValidUpiId(form.paymentUpiId)) {
      next.paymentUpiId = 'Add a UPI ID or upload a QR image, or turn off QR payments.';
    }
    if (form.paymentUpiId.trim() && !isValidUpiId(form.paymentUpiId)) {
      next.paymentUpiId = 'Enter a valid UPI ID like name@oksbi or shop@paytm.';
    }
    if (form.paymentLinkEnabled && !form.paymentLink.trim()) {
      next.paymentLink = 'Add a payment link or turn off payment link.';
    }
    if (form.paymentInstructionsEnabled && !form.paymentInstructions.trim()) {
      next.paymentInstructions = 'Add payment instructions or turn this option off.';
    }
    if (advanced) {
      const threshold = Number(form.lowStockThreshold);
      if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000) {
        next.lowStockThreshold = 'Enter a whole number from 0 to 1000.';
      }
    }
    return next;
  }

  async function save(event) {
    event.preventDefault();
    const nextErrors = clientErrors();
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const result = await updateBusinessSettings({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        category: form.category.trim().replace(/\s+/g, ' '),
        description: form.description.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        logo: form.logo,
        currency: form.currency,
        pickupEnabled: form.pickupEnabled,
        deliveryEnabled: form.deliveryEnabled,
        deliveryFee: Number(form.deliveryFee || 0),
        deliveryEstimateEnabled: form.deliveryEstimateEnabled,
        deliveryEstimate: form.deliveryEstimate,
        deliveryEstimateNote: form.deliveryEstimateNote.replace(/\s+/g, ' ').trim(),
        storefrontActive: form.storefrontActive,
        paymentQrEnabled: form.paymentQrEnabled,
        paymentLinkEnabled: form.paymentLinkEnabled,
        paymentInstructionsEnabled: form.paymentInstructionsEnabled,
        payOnPickupEnabled: form.payOnPickupEnabled,
        cashOnDeliveryEnabled: form.cashOnDeliveryEnabled,
        paymentLink: form.paymentLink.trim(),
        paymentQrImage: form.paymentQrImage,
        paymentUpiId: form.paymentUpiId.trim().toLowerCase(),
        paymentInstructions: form.paymentInstructions.trim(),
        emailNewOrders: form.emailNewOrders,
        emailPayments: form.emailPayments,
        emailCustomerWants: form.emailCustomerWants,
        emailLowStock: form.emailLowStock,
        emailWeeklyReport: form.emailWeeklyReport,
        emailOrderConfirmation: form.emailOrderConfirmation,
        emailOrderUpdates: form.emailOrderUpdates,
        ...(advanced ? { lowStockThreshold: Number(form.lowStockThreshold) } : {}),
      });
      setForm(toForm(result.business));
      await refresh();
      notify(result.message || 'Settings saved.');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updatePassword(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
    setPasswordSuccess('');
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    if (changingPassword) return;
    const nextErrors = passwordErrorsFor(passwordForm);
    setPasswordErrors(nextErrors);
    setPasswordError('');
    setPasswordSuccess('');
    if (Object.keys(nextErrors).length) return;

    setChangingPassword(true);
    try {
      const result = await changePassword(passwordForm);
      const message = result.message || 'Your password has been changed.';
      setPasswordForm(emptyPasswordForm);
      setPasswordSuccess(message);
      notify(message);
    } catch (err) {
      setPasswordErrors(getFieldErrors(err));
      setPasswordError(getErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }

  // Seller Profile has its own password form, so business settings cannot be submitted from it.
  const Panel = sellerProfile ? 'section' : 'form';
  const panelProps = sellerProfile ? {} : { onSubmit: save, noValidate: true };

  if (loadState === 'loading') {
    return <section className="card panel-state">Loading settings...</section>;
  }

  if (loadState === 'error') {
    return (
      <section className="card panel-state">
        <p className="form-error">{loadError}</p>
      </section>
    );
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Settings"
        subtitle="Configure how your shop looks and how customers order."
      />
      <div className="settings-grid">
        <div className="settings-nav card" aria-label="Settings navigation">
          {tabs.map((item) => {
            const Icon = TAB_ICONS[item] || Building2;
            return (
              <button
                key={item}
                type="button"
                className={tab === item ? 'selected' : ''}
                onClick={() => setTab(item)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{item}</span>
              </button>
            );
          })}
        </div>

        <Panel className="card settings-form" {...panelProps}>
          <div className="form-heading">
            <div>
              <div className="form-heading-title-row">
                <h2>{tab}</h2>
                {tab === 'Business Profile' ? (
                  <span className="badge soft-orange">Public profile</span>
                ) : null}
              </div>
              <p className="muted">
                {tab === 'Business Profile' && 'This information appears on your public storefront.'}
                {tab === 'Storefront' && 'Control your public shop link and whether customers can browse.'}
                {tab === 'Ordering & Delivery' && 'Choose how customers receive orders and what delivery costs.'}
                {tab === 'Seller Profile' && 'Manage your account details and security.'}
                {tab === 'Customer payments' && 'Tell customers how to pay you directly. Cove does not collect or verify these payments.'}
                {tab === 'Notifications' && 'Choose which email alerts Cove sends to your account email.'}
              </p>
            </div>
            {sellerProfile ? null : (
              <button className="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            )}
          </div>

          {formError && !sellerProfile ? <p className="form-error">{formError}</p> : null}

          {tab === 'Seller Profile' ? (
            <div className="settings-profile-layout seller-profile">
              <div className="settings-section">
                <div className="settings-section-head">
                  <h3>Account</h3>
                  <p className="muted">The person who signs in to Cove and manages this shop.</p>
                </div>
                <div className="seller-account-card">
                  <div className="seller-account-avatar" aria-hidden="true">{initials(user?.name, 2)}</div>
                  <div className="seller-account-main">
                    <div className="seller-account-name-row">
                      <strong>{user?.name || 'Seller'}</strong>
                      <span className="badge soft-orange">Shop owner</span>
                      {user?.isPlatformAdmin ? <span className="badge blue">Cove admin</span> : null}
                    </div>
                    <dl className="seller-account-details">
                      <div>
                        <dt>Account email</dt>
                        <dd>{user?.email}</dd>
                      </div>
                      <div>
                        <dt>Email status</dt>
                        <dd>
                          {user?.emailVerified === false ? (
                            <span className="email-verification-status">
                              <span className="badge orange">Verification required</span>
                              <ResendVerificationButton onResult={notify} />
                            </span>
                          ) : (
                            <span className="badge green">Verified</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="seller-account-note muted">
                      Cove sends sign-in, security and order emails to this address.
                    </p>
                  </div>
                </div>

                <div className="seller-summary-grid">
                  <div className="seller-summary-card">
                    <div className="seller-summary-head">
                      <Building2 size={16} aria-hidden="true" />
                      <span>Business</span>
                    </div>
                    <div className="seller-summary-business">
                      {form.logo ? (
                        <img className="seller-summary-logo" src={mediaUrl(form.logo)} alt="" />
                      ) : (
                        <div className="seller-summary-logo" aria-hidden="true">{initials(form.name, 1)}</div>
                      )}
                      <div className="seller-summary-text">
                        <strong>{form.name || 'Your shop'}</strong>
                        <span className="muted">
                          {[form.category, form.city].filter(Boolean).join(' · ') || 'Add your shop details'}
                        </span>
                      </div>
                    </div>
                    <div className="seller-summary-actions">
                      <button className="secondary" type="button" onClick={() => setTab('Business Profile')}>
                        Edit business profile
                      </button>
                      {form.slug ? (
                        <a className="seller-summary-link" href={publicPath} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} aria-hidden="true" />
                          <span>View store</span>
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {planSummary ? (
                    <div className="seller-summary-card">
                      <div className="seller-summary-head">
                        <CreditCard size={16} aria-hidden="true" />
                        <span>Cove plan</span>
                      </div>
                      <div className="seller-summary-plan">
                        <div className="seller-summary-name-row">
                          <strong>{planSummary.name}</strong>
                          {planSummary.badge ? (
                            <span className={`badge ${planSummary.badge.tone}`}>{planSummary.badge.label}</span>
                          ) : null}
                        </div>
                        <span className="muted">{planSummary.text}</span>
                      </div>
                      <div className="seller-summary-actions">
                        <Link className="secondary" to="/billing">Manage billing</Link>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h3>Change password</h3>
                  <p className="muted">Use at least 8 characters with a letter and a number.</p>
                </div>
                <div className="seller-password-card">
                  <form className="settings-section-body" onSubmit={handlePasswordChange} noValidate>
                    {passwordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
                    {passwordSuccess ? <p className="form-notice" role="status">{passwordSuccess}</p> : null}
                    <div className="form-grid">
                      <div className="wide">
                        <PasswordField
                          id="current-password"
                          name="currentPassword"
                          label="Current password"
                          autoComplete="current-password"
                          value={passwordForm.currentPassword}
                          onChange={updatePassword}
                          disabled={changingPassword}
                          error={passwordErrors.currentPassword}
                        />
                      </div>
                      <PasswordField
                        id="new-password"
                        name="newPassword"
                        label="New password"
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        hint="Use a letter and a number."
                        value={passwordForm.newPassword}
                        onChange={updatePassword}
                        disabled={changingPassword}
                        error={passwordErrors.newPassword}
                      />
                      <PasswordField
                        id="confirm-password"
                        name="confirmPassword"
                        label="Confirm new password"
                        autoComplete="new-password"
                        value={passwordForm.confirmPassword}
                        onChange={updatePassword}
                        disabled={changingPassword}
                        error={passwordErrors.confirmPassword}
                      />
                      <div className="wide">
                        <button type="submit" className="primary" disabled={changingPassword}>
                          {changingPassword ? 'Changing password...' : 'Change password'}
                        </button>
                        <p className="muted">Changing your password signs you out on your other devices.</p>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : null}
          {tab === 'Business Profile' ? (
            <div className="settings-profile-layout">
              <div className="settings-section">
                <div className="settings-section-head">
                  <h3>Store logo &amp; branding</h3>
                  <p className="muted">Displayed on your storefront header, mobile preview, and order invoices.</p>
                </div>
                <div className="logo-upload">
                  {form.logo ? (
                    <img className="logo-circle" src={mediaUrl(form.logo)} alt="" />
                  ) : (
                    <div className="logo-circle">{initials(form.name, 1)}</div>
                  )}
                  <div className="logo-meta">
                    <div className="logo-title-row">
                      <strong>Business logo</strong>
                      {form.logo ? (
                        <span className="badge green">Custom logo</span>
                      ) : (
                        <span className="badge soft-orange">Default avatar</span>
                      )}
                    </div>
                    <p className="muted">JPG, PNG, or WebP · up to 10 MB, resized automatically</p>
                    {logoError ? <span className="field-error">{logoError}</span> : null}
                    {errors.logo ? <span className="field-error">{errors.logo}</span> : null}
                  </div>
                  <div className="logo-actions">
                    <button className="secondary" type="button" onClick={() => fileInput.current?.click()}>
                      <Upload size={14} aria-hidden="true" />
                      <span>Upload new</span>
                    </button>
                    {form.logo ? (
                      <button
                        className="secondary danger-text"
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, logo: '' }))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInput}
                    className="product-file-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onLogoSelected}
                  />
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h3>Shop details</h3>
                  <p className="muted">The primary name, catalog category, and story for your brand.</p>
                </div>
                <div className="form-grid">
                  <label>
                    <div className="label-header">
                      <span>Business name</span>
                      <span className="field-required">*</span>
                    </div>
                    <input
                      name="name"
                      value={form.name}
                      onChange={update}
                      required
                      maxLength={80}
                      placeholder="e.g. Clay & Craft Studio"
                    />
                    {errors.name ? <span className="field-error">{errors.name}</span> : null}
                  </label>
                  <CategoryField
                    className="wide"
                    value={form.category}
                    onChange={(category) => setForm((current) => ({ ...current, category }))}
                    error={errors.category}
                  />
                  <label className="wide">
                    <div className="label-header">
                      <span>Description</span>
                      <span className="char-count">{form.description.length}/300</span>
                    </div>
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={update}
                      maxLength={300}
                      rows={3}
                      placeholder="A short line about your business, craft, or specialty."
                    />
                    {errors.description ? <span className="field-error">{errors.description}</span> : null}
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-head">
                  <h3>Contact &amp; location</h3>
                  <p className="muted">Direct contact channels shown to customers on order confirmations and invoice receipts.</p>
                </div>
                <div className="form-grid">
                  <label>
                    <span>Phone number</span>
                    <input
                      name="phone"
                      type="tel"
                      value={form.phone}
                      onChange={update}
                      placeholder="98765 43210"
                    />
                    {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
                  </label>
                  <label>
                    <span>Business email</span>
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={update}
                      placeholder="hello@yourshop.com"
                    />
                    {errors.email ? <span className="field-error">{errors.email}</span> : null}
                  </label>
                  <label>
                    <span>City</span>
                    <input
                      name="city"
                      value={form.city}
                      onChange={update}
                      maxLength={60}
                      placeholder="City or locality"
                    />
                  </label>
                </div>
              </div>

              <div className="settings-info-banner">
                <div className="settings-info-banner-content">
                  <Info size={18} className="settings-info-banner-icon" aria-hidden="true" />
                  <p className="muted">
                    These business details may be displayed on your public storefront so customers can identify and contact
                    your shop.
                  </p>
                </div>
                {form.slug ? (
                  <a className="secondary store-preview-link" href={publicPath} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} aria-hidden="true" />
                    <span>Preview store</span>
                  </a>
                ) : null}
              </div>

              {user ? (
                <div className="settings-owner-card">
                  <div className="settings-owner-avatar">{initials(user?.name, 1)}</div>
                  <div className="settings-owner-info">
                    <div className="settings-owner-name-row">
                      <strong className="settings-owner-name">{user?.name || 'Store Owner'}</strong>
                      <span className="badge">Account Owner</span>
                      {user?.emailVerified ? (
                        <span className="badge green">Verified</span>
                      ) : null}
                    </div>
                    <p className="settings-owner-email">{user?.email}</p>
                  </div>
                  <div className="settings-owner-note muted">
                    Cove account
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'Storefront' ? (
            <div className="form-grid">
              <label className="wide settings-toggle">
                <span>
                  <strong>Storefront active</strong>
                  <small className="muted">When off, customers see that the shop is unavailable and cannot order.</small>
                </span>
                <input name="storefrontActive" type="checkbox" checked={form.storefrontActive} onChange={update} />
              </label>
              <label className="wide">
                Storefront link
                <div className="url-input">
                  <span>/store/</span>
                  <input name="slug" value={form.slug} onChange={update} aria-label="Storefront slug" />
                </div>
                {errors.slug ? <span className="field-error">{errors.slug}</span> : null}
                <div className="store-link-row settings-link-row">
                  <input readOnly value={publicUrl || publicPath} aria-label="Full storefront link" />
                  <button className="secondary" type="button" onClick={handleCopy} disabled={!form.slug}>
                    <Copy size={15} /> Copy link
                  </button>
                  <a className="secondary" href={publicPath} target="_blank" rel="noreferrer">
                    <ExternalLink size={15} /> Open storefront
                  </a>
                </div>
              </label>
              <label>
                Currency
                <select name="currency" value={form.currency} onChange={update}>
                  {CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
                </select>
                {errors.currency ? <span className="field-error">{errors.currency}</span> : null}
              </label>
              <p className="muted wide">
                Prices and order totals are shown in this currency. Changing it does not convert your existing prices.
              </p>
              <div className="wide storefront-customize-entry">
                <strong>Customize storefront</strong>
                <p className="muted">Choose a theme and accent color, and add an announcement for your public shop.</p>
                <Link className="secondary" to="/storefront#customize">
                  Open customize storefront
                </Link>
              </div>
            </div>
          ) : null}

          {tab === 'Ordering & Delivery' ? (
            <div className="form-grid">
              <label className="wide settings-toggle">
                <span>
                  <strong>Pickup enabled</strong>
                  <small className="muted">Allow customers to collect orders themselves.</small>
                </span>
                <input name="pickupEnabled" type="checkbox" checked={form.pickupEnabled} onChange={update} />
              </label>
              <label className="wide settings-toggle">
                <span>
                  <strong>Delivery enabled</strong>
                  <small className="muted">Allow customers to request delivery.</small>
                </span>
                <input name="deliveryEnabled" type="checkbox" checked={form.deliveryEnabled} onChange={update} />
              </label>
              <label>
                Delivery fee
                <input
                  name="deliveryFee"
                  inputMode="decimal"
                  value={form.deliveryFee}
                  onChange={update}
                  disabled={!form.deliveryEnabled}
                />
                {errors.deliveryFee ? <span className="field-error">{errors.deliveryFee}</span> : null}
                <small className="muted">Shown as {formatPrice(Number(form.deliveryFee) || 0, form.currency)} on checkout when delivery is selected.</small>
              </label>

              <label className="wide settings-toggle">
                <span>
                  <strong>Show estimated delivery</strong>
                  <small className="muted">
                    Tell delivery customers roughly when to expect their order. Shown at checkout, on the order page and in
                    order emails, always as an estimate rather than a guarantee.
                    {form.deliveryEnabled ? '' : ' Only shown when delivery is turned on.'}
                  </small>
                </span>
                <input
                  name="deliveryEstimateEnabled"
                  type="checkbox"
                  checked={form.deliveryEstimateEnabled}
                  onChange={update}
                />
              </label>
              {form.deliveryEstimateEnabled ? (
                <>
                  <label>
                    Estimated delivery
                    <select name="deliveryEstimate" value={form.deliveryEstimate} onChange={update}>
                      {DELIVERY_ESTIMATE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="wide">
                    {form.deliveryEstimate === 'custom' ? 'Custom delivery message' : (
                      <>Delivery note <span className="hint-inline">(optional)</span></>
                    )}
                    <input
                      name="deliveryEstimateNote"
                      value={form.deliveryEstimateNote}
                      onChange={update}
                      maxLength={DELIVERY_ESTIMATE_NOTE_MAX}
                      placeholder={form.deliveryEstimate === 'custom'
                        ? 'Delivered within 48 hours in the city'
                        : 'Orders placed before 2 PM are usually delivered the same day.'}
                    />
                    {errors.deliveryEstimateNote ? <span className="field-error">{errors.deliveryEstimateNote}</span> : null}
                  </label>
                  {previewDeliveryEstimate(form) ? (
                    <div className="wide">
                      <small className="muted">Customers will see:</small>
                      <DeliveryEstimate estimate={previewDeliveryEstimate(form)} />
                    </div>
                  ) : null}
                </>
              ) : null}
              {!form.pickupEnabled && !form.deliveryEnabled ? (
                <p className="form-error wide">Both pickup and delivery are off. Customers will not be able to place orders.</p>
              ) : null}
            </div>
          ) : null}

          {tab === 'Customer payments' ? (
            <div className="form-grid">
              <p className="muted wide">
                Customers pay you directly. You confirm payment yourself in Orders. Cove never receives these funds.
              </p>
              <PaymentCurrencyInfo />

              <label className="wide settings-toggle">
                <span>
                  <strong>{form.currency === 'INR' ? 'UPI / QR code' : 'QR code'}</strong>
                  <small className="muted">
                    {form.currency === 'INR'
                      ? 'Let customers pay with an order-specific UPI link and QR, or your uploaded QR.'
                      : 'Show your payment QR on checkout and confirmation.'}
                  </small>
                  <PaymentCurrencyNote method="qr" />
                </span>
                <input name="paymentQrEnabled" type="checkbox" checked={form.paymentQrEnabled} onChange={update} />
              </label>
              {form.paymentQrEnabled ? (
                <>
                  {form.currency === 'INR' ? (
                    <label className="wide">
                      UPI ID (VPA)
                      <input
                        name="paymentUpiId"
                        value={form.paymentUpiId}
                        onChange={update}
                        placeholder="shopname@oksbi"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      {errors.paymentUpiId ? <span className="field-error">{errors.paymentUpiId}</span> : null}
                      <small className="muted">
                        Cove uses this to create an order-specific UPI payment link and QR with the exact
                        order amount and order number prefilled. Cove never collects the money — you still
                        confirm payment yourself after checking your account.
                      </small>
                      {form.paymentUpiId.trim() ? (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, paymentUpiId: '' }))}
                        >
                          Remove UPI ID
                        </button>
                      ) : null}
                    </label>
                  ) : null}

                  {sampleUpiUri && upiPreviewQr ? (
                    <div className="wide payment-upi-preview">
                      <strong>Buyer preview (sample ₹100)</strong>
                      <p className="muted">
                        After an order is placed, the amount and order number replace this sample.
                        This is not a live payment.
                      </p>
                      <div className="payment-upi-preview-row">
                        <img src={upiPreviewQr} alt="Sample order-specific UPI QR preview" />
                        <div>
                          <p><span className="muted">Payee</span><br /><strong>{form.name || 'Shop'}</strong></p>
                          <p><span className="muted">UPI ID</span><br /><strong>{form.paymentUpiId.trim().toLowerCase()}</strong></p>
                          <p><span className="muted">Sample note</span><br /><strong>ORDER-SAMPLE</strong></p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="wide logo-upload">
                    {form.paymentQrImage ? (
                      <img className="payment-qr-preview" src={mediaUrl(form.paymentQrImage)} alt="Payment QR preview" />
                    ) : (
                      <div className="payment-qr-preview empty">
                        {form.currency === 'INR' ? 'Optional fallback QR' : 'No QR yet'}
                      </div>
                    )}
                    <div>
                      <strong>{form.currency === 'INR' ? 'Uploaded QR (fallback)' : 'QR image'}</strong>
                      <p className="muted">
                        {form.currency === 'INR'
                          ? 'Optional if you added a UPI ID. Shown when a customer cannot open UPI apps. JPG, PNG, or WebP · up to 10 MB, resized automatically'
                          : 'JPG, PNG, or WebP · up to 10 MB, resized automatically'}
                      </p>
                      {qrError ? <span className="field-error">{qrError}</span> : null}
                      {errors.paymentQrImage ? <span className="field-error">{errors.paymentQrImage}</span> : null}
                    </div>
                    <div className="logo-actions">
                      <button className="secondary" type="button" onClick={() => qrInput.current?.click()}>
                        Upload QR
                      </button>
                      {form.paymentQrImage ? (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, paymentQrImage: '' }))}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <input
                      ref={qrInput}
                      className="product-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={onQrSelected}
                    />
                  </div>
                </>
              ) : null}

              <label className="wide settings-toggle">
                <span>
                  <strong>{form.currency === 'INR' ? 'UPI / payment link' : 'Payment link'}</strong>
                  <small className="muted">Share a link customers can open to pay you.</small>
                  <PaymentCurrencyNote method="link" />
                </span>
                <input name="paymentLinkEnabled" type="checkbox" checked={form.paymentLinkEnabled} onChange={update} />
              </label>
              {form.paymentLinkEnabled ? (
                <label className="wide">
                  Payment link
                  <input
                    name="paymentLink"
                    value={form.paymentLink}
                    onChange={update}
                    placeholder="https://"
                    inputMode="url"
                  />
                  {errors.paymentLink ? <span className="field-error">{errors.paymentLink}</span> : null}
                </label>
              ) : null}

              <label className="wide settings-toggle">
                <span>
                  <strong>Payment instructions</strong>
                  <small className="muted">Bank transfer details or other written instructions.</small>
                  <PaymentCurrencyNote method="instructions" />
                </span>
                <input
                  name="paymentInstructionsEnabled"
                  type="checkbox"
                  checked={form.paymentInstructionsEnabled}
                  onChange={update}
                />
              </label>
              {form.paymentInstructionsEnabled ? (
                <label className="wide">
                  Instructions
                  <textarea
                    name="paymentInstructions"
                    value={form.paymentInstructions}
                    onChange={update}
                    maxLength={1000}
                    rows={4}
                    placeholder="Account name, UPI ID, or how you want to be paid."
                  />
                  {errors.paymentInstructions ? <span className="field-error">{errors.paymentInstructions}</span> : null}
                </label>
              ) : null}

              <label className="wide settings-toggle">
                <span>
                  <strong>Pay on pickup</strong>
                  <small className="muted">Let pickup customers pay when they collect the order.</small>
                  <PaymentCurrencyNote method="pickup" />
                </span>
                <input name="payOnPickupEnabled" type="checkbox" checked={form.payOnPickupEnabled} onChange={update} />
              </label>

              <label className="wide settings-toggle">
                <span>
                  <strong>Cash on delivery</strong>
                  <small className="muted">
                    Let delivery customers pay in cash when the order arrives. You mark the order paid once you receive the cash.
                    {form.deliveryEnabled ? '' : ' Only shown to customers when delivery is turned on.'}
                  </small>
                  <PaymentCurrencyNote method="cod" />
                </span>
                <input
                  name="cashOnDeliveryEnabled"
                  type="checkbox"
                  checked={form.cashOnDeliveryEnabled}
                  onChange={update}
                />
              </label>
            </div>
          ) : null}

          {tab === 'Notifications' ? (
            <div className="form-grid">
              <div className="wide settings-toggle">
                <span>
                  <strong>Account email</strong>
                  <small className="muted">{user?.email}</small>
                </span>
                {user?.emailVerified === false ? (
                  <span className="email-verification-status">
                    <span className="badge orange">Email verification required</span>
                    <ResendVerificationButton onResult={notify} />
                  </span>
                ) : (
                  <span className="badge green">Email verified</span>
                )}
              </div>
              <p className="muted wide">
                These emails go to your Cove account email. In-app notifications always appear in the bell menu.
              </p>
              <label className="wide settings-toggle">
                <span>
                  <strong>New order emails</strong>
                  <small className="muted">When a customer places an order on your storefront.</small>
                </span>
                <input name="emailNewOrders" type="checkbox" checked={form.emailNewOrders} onChange={update} />
              </label>
              <label className="wide settings-toggle">
                <span>
                  <strong>Payment emails</strong>
                  <small className="muted">When a customer submits a payment reference.</small>
                </span>
                <input name="emailPayments" type="checkbox" checked={form.emailPayments} onChange={update} />
              </label>
              <label className="wide settings-toggle">
                <span>
                  <strong>Customer Want emails</strong>
                  <small className="muted">When someone requests a product you do not list yet.</small>
                </span>
                <input name="emailCustomerWants" type="checkbox" checked={form.emailCustomerWants} onChange={update} />
              </label>

              <h3 className="wide settings-subhead">Customer emails</h3>
              <label className="wide settings-toggle">
                <span>
                  <strong>Order confirmation to customers</strong>
                  <small className="muted">Sent when a customer who gave an email places an order. Includes the order summary and a link to track it.</small>
                </span>
                <input name="emailOrderConfirmation" type="checkbox" checked={form.emailOrderConfirmation} onChange={update} />
              </label>
              <label className="wide settings-toggle">
                <span>
                  <strong>Order updates to customers</strong>
                  <small className="muted">Sent when you change an order’s status, including cancellations.</small>
                </span>
                <input name="emailOrderUpdates" type="checkbox" checked={form.emailOrderUpdates} onChange={update} />
              </label>

              <h3 className="wide settings-subhead">
                Cove Plus emails {!advanced ? <span className="badge orange">Plus</span> : null}
              </h3>
              {!advanced ? (
                <p className="muted wide">
                  Low-stock alerts and weekly reports are sent to Cove Plus shops. You can set your preference now.{' '}
                  <Link className="text-button inline" to="/billing">View Cove Plus</Link>
                </p>
              ) : null}
              <label className="wide settings-toggle">
                <span>
                  <strong>Low-stock alerts</strong>
                  <small className="muted">When an order brings a product down to your low-stock level or sells it out.</small>
                </span>
                <input name="emailLowStock" type="checkbox" checked={form.emailLowStock} onChange={update} />
              </label>
              <label className="wide settings-toggle">
                <span>
                  <strong>Weekly performance report</strong>
                  <small className="muted">A Monday summary of last week’s visitors, orders, revenue and top products.</small>
                </span>
                <input name="emailWeeklyReport" type="checkbox" checked={form.emailWeeklyReport} onChange={update} />
              </label>
              {advanced ? (
                <label>
                  Low-stock level
                  <input
                    name="lowStockThreshold"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="1000"
                    step="1"
                    value={form.lowStockThreshold}
                    onChange={update}
                  />
                  <small className="muted">Alert when stock falls to this number or below. Use 0 to be alerted only when a product sells out.</small>
                  {errors.lowStockThreshold ? <span className="field-error">{errors.lowStockThreshold}</span> : null}
                </label>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
