import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import { forgotPassword } from '../services/authService';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Please enter a valid email.';
    }
    setErrors(nextErrors);
    setFormError('');
    setMessage('');
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const result = await forgotPassword({ email: email.trim() });
      setMessage(result.message || 'If an account exists for this email, a password reset link has been sent.');
    } catch (err) {
      setErrors(getFieldErrors(err));
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your account email and we will send a reset link if it matches an account."
      footer={
        <>
          Remembered it? <Link to="/login">Back to login</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {formError ? <div className="form-error">{formError}</div> : null}
        {message ? <div className="form-success">{message}</div> : null}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
          {errors.email ? <span className="field-error">{errors.email}</span> : null}
        </label>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
    </AuthLayout>
  );
}
