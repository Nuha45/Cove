import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import PasswordField from '../components/ui/PasswordField';
import { useAuth } from '../context/AuthContext';
import { wakeApi } from '../services/authService';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { isTransientError, UNAVAILABLE_MESSAGE, WAKING_MESSAGE, withTransientRetry } from '../utils/retry';

const emptyForm = { email: '', password: '' };

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [waking, setWaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // State updates are async, so a fast double submit could slip past `submitting`.
  const inFlight = useRef(false);
  const resetSuccess = Boolean(location.state?.resetSuccess);

  useEffect(() => {
    wakeApi();
  }, []);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Please enter your email.';
    if (!form.password) nextErrors.password = 'Please enter your password.';
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    inFlight.current = true;
    setSubmitting(true);
    const credentials = { email: form.email.trim(), password: form.password };
    try {
      await withTransientRetry(() => login(credentials), { onRetry: () => setWaking(true) });
      navigate('/dashboard');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(isTransientError(err) ? UNAVAILABLE_MESSAGE : getErrorMessage(err));
    } finally {
      inFlight.current = false;
      setWaking(false);
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
      <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        {resetSuccess ? <div className="form-success">Password updated. You can log in now.</div> : null}
        {waking ? <div className="form-notice" role="status">{WAKING_MESSAGE}</div> : null}
        {formError ? <div className="form-error" role="alert">{formError}</div> : null}
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
          {waking ? 'Waking up Cove...' : submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
