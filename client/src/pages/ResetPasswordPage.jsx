import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import PasswordField from '../components/ui/PasswordField';
import { resetPassword } from '../services/authService';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!token) nextErrors.token = 'Invalid or expired reset link.';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      nextErrors.password = 'Use at least 8 characters, including a letter and a number.';
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      await resetPassword({
        token,
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      navigate('/login', { replace: true, state: { resetSuccess: true } });
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Enter a new password for your Cove account."
      footer={
        <>
          <Link to="/login">Back to login</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError ? <div className="form-error">{formError}</div> : null}
        {!token ? <div className="form-error">Invalid or expired reset link.</div> : null}
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          placeholder="At least 8 characters"
          hint="Use a letter and a number."
          error={errors.password}
          disabled={!token}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update}
          error={errors.confirmPassword}
          disabled={!token}
        />
        <button className="primary" type="submit" disabled={submitting || !token}>
          {submitting ? 'Saving...' : 'Reset password'}
        </button>
      </form>
    </AuthLayout>
  );
}
