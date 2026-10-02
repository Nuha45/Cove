import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import PasswordField from '../components/ui/PasswordField';
import { useAuth } from '../context/AuthContext';
import CategoryField from '../components/ui/CategoryField';
import { categoryError } from '../utils/categories';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  category: '',
  phone: '',
  city: '',
};

function localErrors(form) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Please enter a valid email.';
  }
  if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = 'Use at least 8 characters, including a letter and a number.';
  }
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  if (form.businessName.trim().length < 2) errors.businessName = 'Please enter your business name.';
  const category = categoryError(form.category);
  if (category) errors.category = category;
  const phone = form.phone.trim();
  if (!phone) errors.phone = 'Please enter your phone number.';
  else if (!/^[+0-9][0-9\s()-]{6,19}$/.test(phone)) errors.phone = 'Please enter a valid phone number.';
  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = localErrors(form);
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        businessName: form.businessName.trim(),
        category: form.category.trim().replace(/\s+/g, ' '),
        phone: form.phone.trim(),
        city: form.city.trim(),
      });
      navigate('/dashboard');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Start your shop"
      subtitle="Create an account for your business. It only takes a minute."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError ? <div className="form-error">{formError}</div> : null}
        <label>
          Your name
          <input name="name" autoComplete="name" value={form.name} onChange={update} />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" value={form.email} onChange={update} />
          {errors.email ? <span className="field-error">{errors.email}</span> : null}
        </label>
        <PasswordField
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          placeholder="At least 8 characters"
          hint="Use a letter and a number. We never store the password itself."
          error={errors.password}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update}
          error={errors.confirmPassword}
        />
        <label>
          Business name
          <input name="businessName" value={form.businessName} onChange={update} />
          {errors.businessName ? <span className="field-error">{errors.businessName}</span> : null}
        </label>
        <CategoryField
          value={form.category}
          onChange={(category) => setForm((current) => ({ ...current, category }))}
          error={errors.category}
        />
        <label>
          Phone number
          <input name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} />
          {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
        </label>
        <label>
          City <span className="hint">optional</span>
          <input name="city" autoComplete="address-level2" value={form.city} onChange={update} />
          {errors.city ? <span className="field-error">{errors.city}</span> : null}
        </label>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating your workspace...' : 'Create workspace'}
        </button>
        <p className="auth-legal">
          By creating your Cove account, you agree to the Cove{' '}
          <Link to="/terms" target="_blank" rel="noopener">Terms</Link> and acknowledge the{' '}
          <Link to="/privacy" target="_blank" rel="noopener">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
