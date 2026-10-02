import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import ResendVerificationButton from '../components/layout/ResendVerificationButton';
import { useAuth } from '../context/AuthContext';
import { verifyEmail } from '../services/authService';
import { getErrorMessage } from '../utils/errors';

const INVALID_MESSAGE = 'This verification link is invalid or has already been used.';

const TITLES = {
  ready: 'Verify your email',
  verifying: 'Verifying your email',
  verified: 'Your email is verified',
  expired: 'This link has expired',
  invalid: 'This link cannot be used',
};

// Loading this page never verifies anything. Email security scanners open links and run scripts,
// so the single-use token is only sent when the seller clicks the button.
export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { user, status: authStatus, refreshUser } = useAuth();
  const [state, setState] = useState(token ? 'ready' : 'invalid');
  const [message, setMessage] = useState(token ? '' : INVALID_MESSAGE);
  const [resendMessage, setResendMessage] = useState('');
  // The token is single use; a second click before re-render would report it as already used.
  const submitted = useRef(false);

  async function handleVerify() {
    if (!token || submitted.current) return;
    submitted.current = true;
    setState('verifying');
    try {
      const result = await verifyEmail(token);
      setState('verified');
      setMessage(result.message);
      refreshUser();
    } catch (err) {
      const code = err.response?.data?.errors?.[0]?.message;
      setState(code === 'token_expired' ? 'expired' : 'invalid');
      setMessage(getErrorMessage(err));
    }
  }

  const signedIn = authStatus === 'authenticated';
  const canResend = signedIn && user?.emailVerified === false && state !== 'verified';

  return (
    <AuthLayout
      title={TITLES[state]}
      subtitle={state === 'ready' || state === 'verifying' ? 'Confirm that this email address belongs to you.' : ''}
      footer={<Link to={signedIn ? '/dashboard' : '/login'}>{signedIn ? 'Back to Cove' : 'Back to login'}</Link>}
    >
      <div className="auth-form">
        {state === 'ready' || state === 'verifying' ? (
          <button className="primary" type="button" onClick={handleVerify} disabled={state === 'verifying'}>
            {state === 'verifying' ? 'Verifying...' : 'Verify my email'}
          </button>
        ) : null}

        {state === 'verified' ? (
          <>
            <div className="form-success">{message} You can now use all of Cove.</div>
            <Link className="primary" to={signedIn ? '/dashboard' : '/login'}>
              {signedIn ? 'Continue to Cove' : 'Log in to continue'}
            </Link>
          </>
        ) : null}

        {state === 'expired' || state === 'invalid' ? (
          <>
            <div className="form-error">{message}</div>
            {canResend ? (
              <ResendVerificationButton className="primary" onResult={setResendMessage} />
            ) : null}
            {!signedIn ? (
              <p className="muted">Log in to your Cove account to request a new verification link.</p>
            ) : null}
            {signedIn && user?.emailVerified !== false ? (
              <p className="muted">Your email address is already verified.</p>
            ) : null}
            {resendMessage ? <p className="muted">{resendMessage}</p> : null}
          </>
        ) : null}
      </div>
    </AuthLayout>
  );
}
