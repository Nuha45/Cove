import { Link } from 'react-router-dom';
import { Check, Circle } from 'lucide-react';
import { gettingStartedProgress } from '../../utils/onboarding';

export default function GettingStartedCard({ items, onHide, onOpenTour }) {
  const { done, total, complete } = gettingStartedProgress(items);
  if (!items?.length) return null;
  if (complete) return null;

  const next = items.find((item) => !item.done);

  return (
    <section className="card getting-started-card" aria-labelledby="getting-started-title">
      <div className="getting-started-head">
        <div>
          <p className="eyebrow">GETTING STARTED</p>
          <h2 id="getting-started-title">Finish setting up your shop</h2>
          <p className="muted">
            {done} of {total} complete
            {next ? ` · Next: ${next.label}` : ''}
          </p>
        </div>
        <div className="getting-started-head-actions">
          {onOpenTour ? (
            <button className="secondary tiny" type="button" onClick={onOpenTour}>
              Tour
            </button>
          ) : null}
          {onHide ? (
            <button className="secondary tiny" type="button" onClick={onHide}>
              Hide
            </button>
          ) : null}
        </div>
      </div>

      <ul className="getting-started-list">
        {items.map((item) => (
          <li key={item.id} className={item.done ? 'done' : item.id === next?.id ? 'current' : ''}>
            <span className="getting-started-icon" aria-hidden="true">
              {item.done ? <Check size={14} /> : <Circle size={14} />}
            </span>
            {item.done ? (
              <span className="getting-started-label">{item.label}</span>
            ) : (
              <Link className="getting-started-label" to={item.to}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="getting-started-progress" aria-hidden="true">
        <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
    </section>
  );
}
