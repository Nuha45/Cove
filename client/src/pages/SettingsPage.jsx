import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import ResendVerificationButton from '../components/layout/ResendVerificationButton';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessService';
import { CATEGORIES } from '../utils/categories';
import { CURRENCIES } from '../utils/currencies';
import { formatEyebrowDate, formatPrice, initials } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { prepareLogoImage, prepareQrImage } from '../utils/images';
import { mediaUrl } from '../utils/media';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';
import { buildUpiPayUri, isValidUpiId, upiQrDataUrl } from '../utils/upi';

const tabs = [
  'Business Profile',
  'Storefront',
  'Ordering & Delivery',
  'Customer payments',
  'Notifications',
];

const TAB_ALIASES = {
  profile: 'Business Profile',
  'business-profile': 'Business Profile',
  'business profile': 'Business Profile',
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
  storefrontActive: true,
  paymentQrEnabled: false,
  paymentLinkEnabled: false,
  paymentInstructionsEnabled: false,
  payOnPickupEnabled: true,
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
    storefrontActive: business?.storefrontActive !== false,
    paymentQrEnabled: Boolean(business?.paymentQrEnabled),
    paymentLinkEnabled: Boolean(business?.paymentLinkEnabled),
    paymentInstructionsEnabled: Boolean(business?.paymentInstructionsEnabled),
    payOnPickupEnabled: business?.payOnPickupEnabled !== false,
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
  const [tab, setTab] = useState(() => tabFromSearch(searchParams.get('tab')) || tabs[0]);
  const [form, setForm] = useState(emptyForm);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [qrError, setQrError] = useState('');
  const [upiPreviewQr, setUpiPreviewQr] = useState('');

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
        category: form.category,
        description: form.description.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        logo: form.logo,
        currency: form.currency,
        pickupEnabled: form.pickupEnabled,
        deliveryEnabled: form.deliveryEnabled,
        deliveryFee: Number(form.deliveryFee || 0),
        storefrontActive: form.storefrontActive,
        paymentQrEnabled: form.paymentQrEnabled,
        paymentLinkEnabled: form.paymentLinkEnabled,
        paymentInstructionsEnabled: form.paymentInstructionsEnabled,
        payOnPickupEnabled: form.payOnPickupEnabled,
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
      <form className="settings-grid" onSubmit={save} noValidate>
        <div className="settings-nav card">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? 'selected' : ''}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <section className="card settings-form">
          <div className="form-heading">
            <div>
              <h2>{tab}</h2>
              <p className="muted">
                {tab === 'Business Profile' && 'This information appears on your public storefront.'}
                {tab === 'Storefront' && 'Control your public shop link and whether customers can browse.'}
                {tab === 'Ordering & Delivery' && 'Choose how customers receive orders and what delivery costs.'}
                {tab === 'Customer payments' && 'Tell customers how to pay you directly. Cove does not collect or verify these payments.'}
                {tab === 'Notifications' && 'Choose which email alerts Cove sends to your account email.'}
              </p>
            </div>
            <button className="primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}

          {tab === 'Business Profile' ? (
            <>
              <div className="logo-upload">
                {form.logo ? (
                  <img className="logo-circle" src={mediaUrl(form.logo)} alt="" />
                ) : (
                  <div className="logo-circle">{initials(form.name, 1)}</div>
                )}
                <div>
                  <strong>Business logo</strong>
                  <p className="muted">JPG, PNG, or WebP · up to 10 MB, resized automatically</p>
                  {logoError ? <span className="field-error">{logoError}</span> : null}
                  {errors.logo ? <span className="field-error">{errors.logo}</span> : null}
                </div>
                <div className="logo-actions">
                  <button className="secondary" type="button" onClick={() => fileInput.current?.click()}>
                    Upload new
                  </button>
                  {form.logo ? (
                    <button className="secondary" type="button" onClick={() => setForm((current) => ({ ...current, logo: '' }))}>
                      Remove
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

              <div className="form-grid">
                <label>
                  Business name
                  <input name="name" value={form.name} onChange={update} required maxLength={80} />
                  {errors.name ? <span className="field-error">{errors.name}</span> : null}
                </label>
                <label>
                  Business category
                  <select name="category" value={form.category} onChange={update}>
                    {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="wide">
                  Description
                  <textarea name="description" value={form.description} onChange={update} maxLength={300} rows={3} placeholder="A short line about your business." />
                  {errors.description ? <span className="field-error">{errors.description}</span> : null}
                </label>
                <label>
                  Phone number
                  <input name="phone" value={form.phone} onChange={update} placeholder="98765 43210" />
                  {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
                </label>
                <label>
                  Business email
                  <input name="email" type="email" value={form.email} onChange={update} placeholder="hello@yourshop.com" />
                  {errors.email ? <span className="field-error">{errors.email}</span> : null}
                </label>
                <label>
                  City
                  <input name="city" value={form.city} onChange={update} maxLength={60} />
                </label>
                <p className="wide muted">
                  These business details may be displayed on your public storefront so customers can identify and contact
                  your shop.
                </p>
              </div>
            </>
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

              <label className="wide settings-toggle">
                <span>
                  <strong>{form.currency === 'INR' ? 'UPI / QR code' : 'QR code'}</strong>
                  <small className="muted">
                    {form.currency === 'INR'
                      ? 'Let customers pay with an order-specific UPI link and QR, or your uploaded QR.'
                      : 'Show your payment QR on checkout and confirmation.'}
                  </small>
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
                </span>
                <input name="payOnPickupEnabled" type="checkbox" checked={form.payOnPickupEnabled} onChange={update} />
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
        </section>
      </form>
    </>
  );
}
