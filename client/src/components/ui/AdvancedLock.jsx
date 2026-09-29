import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdvancedLock({ title, text, compact = false }) {
  return (
    <section className={`card advanced-lock${compact ? ' compact' : ''}`}>
      <span className="advanced-lock-icon" aria-hidden="true"><Lock size={16} /></span>
      <div className="advanced-lock-copy">
        <p className="eyebrow">COVE PLUS</p>
        <h2>{title}</h2>
        {text ? <p className="muted">{text}</p> : null}
      </div>
      <Link className="secondary" to="/billing">View Cove Plus</Link>
    </section>
  );
}

export function isAdvancedRequired(err) {
  return err?.response?.status === 403
    && (err.response.data?.errors || []).some((item) => item.message === 'advanced_required');
}
