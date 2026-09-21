import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import PasswordField from '../components/ui/PasswordField';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

const emptyForm = { email: '', password: '' };

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const resetSuccess = Boolean(location.state?.resetSuccess);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Please enter your email.';
    if (!form.password) nextErrors.password = 'Please enter your password.';
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await login({ email: form.email.trim(), password: form.password });
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
      title="Welcome back"
      subtitle="Log in to manage your business."
      footer={
        <>
          New here? <Link to="/register">Create your workspace</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {resetSuccess ? <div className="form-success">Password updated. You can log in now.</div> : null}
        {formError ? <div className="form-error">{formError}</div> : null}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update}
            placeholder="you@example.com"
          />
          {errors.email ? <span className="field-error">{errors.email}</span> : null}
        </label>
        <PasswordField
          name="password"
          autoComplete="current-password"
          value={form.password}
          onChange={update}
          placeholder="Your password"
          error={errors.password}
        />
        <Link className="auth-muted-link" to="/forgot-password">Forgot password?</Link>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
