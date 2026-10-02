import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import ResendVerificationButton from '../components/layout/ResendVerificationButton';
import { useAuth } from '../context/AuthContext';
import { verifyEmail } from '../services/authService';
import { getErrorMessage } from '../utils/errors';

const TITLES = {
  verifying: 'Verifying your email',
  verified: 'Your email is verified',
  expired: 'This link has expired',
  invalid: 'This link cannot be used',
};

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { user, status: authStatus, refresh } = useAuth();
  const [state, setState] = useState(token ? 'verifying' : 'invalid');
  const [message, setMessage] = useState(token ? '' : 'This verification link is invalid or has already been used.');
  const [resendMessage, setResendMessage] = useState('');
  // Tokens are single use, so a second request (React StrictMode re-runs effects) would always fail.
  const attempted = useRef('');

  useEffect(() => {
    if (!token || attempted.current === token) return;
    attempted.current = token;
    verifyEmail(token)
      .then((result) => {
        setState('verified');
        setMessage(result.message);
        refresh();
      })
      .catch((err) => {
        const code = err.response?.data?.errors?.[0]?.message;
        setState(code === 'token_expired' ? 'expired' : 'invalid');
        setMessage(getErrorMessage(err));
      });
  }, [token, refresh]);

  const signedIn = authStatus === 'authenticated';
  const canResend = signedIn && user?.emailVerified === false && state !== 'verified';

  return (
    <AuthLayout
      title={TITLES[state]}
      subtitle={state === 'verifying' ? 'This only takes a moment.' : ''}
      footer={<Link to={signedIn ? '/dashboard' : '/login'}>{signedIn ? 'Back to Cove' : 'Back to login'}</Link>}
    >
      <div className="auth-form">
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
