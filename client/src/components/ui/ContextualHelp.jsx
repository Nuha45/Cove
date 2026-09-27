import { useId, useState } from 'react';
import { Info } from 'lucide-react';

export default function ContextualHelp({ label = 'More information', text }) {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  if (!text) return null;

  return (
    <span className="contextual-help">
      <button
        type="button"
        className="contextual-help-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => setOpen(false)}
      >
        <Info size={14} aria-hidden="true" />
      </button>
      <span id={tipId} role="tooltip" className={`contextual-help-tip${open ? ' open' : ''}`}>
        {text}
      </span>
    </span>
  );
}
