import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import { getBusinessSettings, updateBusinessSettings } from '../services/businessService';
import { CATEGORIES } from '../utils/categories';
import { CURRENCIES } from '../utils/currencies';
import { formatEyebrowDate, formatPrice, initials } from '../utils/display';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { mediaUrl } from '../utils/media';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';

const tabs = [
  'Business Profile',
  'Storefront',
  'Ordering & Delivery',
];

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
  };
}

export default function SettingsPage() {
  const { refresh } = useAuth();
  const { notify } = useOutletContext();
  const fileInput = useRef(null);
  const [tab, setTab] = useState(tabs[0]);
  const [form, setForm] = useState(emptyForm);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState('');

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

  function onLogoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setLogoError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setLogoError('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 450 * 1024) {
      setLogoError('Please use an image under 450KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, logo: String(reader.result || '') }));
    };
    reader.onerror = () => setLogoError('That image could not be read.');
    reader.readAsDataURL(file);
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
                  <p className="muted">JPG, PNG, or WebP · under 450KB</p>
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
              <p className="muted wide">Prices on your storefront use this currency for display. Order totals are still calculated from product prices and delivery fee.</p>
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
        </section>
      </form>
    </>
  );
}
