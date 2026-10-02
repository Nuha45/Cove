import { useState } from 'react';
import { resendVerification } from '../../services/authService';
import { getErrorMessage } from '../../utils/errors';

export default function ResendVerificationButton({ className = 'secondary', onResult }) {
  const [sending, setSending] = useState(false);

  async function handleClick() {
    setSending(true);
    try {
      const result = await resendVerification();
      onResult?.(result.message || 'A new verification link has been sent.');
    } catch (err) {
      onResult?.(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <button className={className} type="button" onClick={handleClick} disabled={sending}>
      {sending ? 'Sending...' : 'Resend verification email'}
    </button>
  );
}
