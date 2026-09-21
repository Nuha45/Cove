import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import PasswordField from '../components/ui/PasswordField';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES } from '../utils/categories';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  businessName: '',
  category: 'Jewelry & Accessories',
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
  if (!CATEGORIES.includes(form.category)) errors.category = 'Please choose a category.';
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
        category: form.category,
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
          <input name="name" autoComplete="name" value={form.name} onChange={update} placeholder="Aisha Shah" />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>
        <label>
          Email
          <input name="email" type="email" autoComplete="email" value={form.email} onChange={update} placeholder="you@example.com" />
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
          <input name="businessName" value={form.businessName} onChange={update} placeholder="Zahra Jewelry" />
          {errors.businessName ? <span className="field-error">{errors.businessName}</span> : null}
        </label>
        <label>
          Business category
          <select name="category" value={form.category} onChange={update}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          {errors.category ? <span className="field-error">{errors.category}</span> : null}
        </label>
        <label>
          Phone number <span className="hint">optional</span>
          <input name="phone" value={form.phone} onChange={update} placeholder="+91 98765 43210" />
          {errors.phone ? <span className="field-error">{errors.phone}</span> : null}
        </label>
        <label>
          City <span className="hint">optional</span>
          <input name="city" value={form.city} onChange={update} placeholder="Bengaluru" />
          {errors.city ? <span className="field-error">{errors.city}</span> : null}
        </label>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Creating your workspace...' : 'Create workspace'}
        </button>
      </form>
    </AuthLayout>
  );
}
