import { useState } from 'react';
import { CATEGORIES, CATEGORY_MAX } from '../../utils/categories';

const COLLAPSED_COUNT = 8;

export default function CategoryField({ value, onChange, error, label = 'Store type', className = '' }) {
  const current = value.trim().toLowerCase();
  const selectedIndex = CATEGORIES.findIndex((item) => item.toLowerCase() === current);
  const [expanded, setExpanded] = useState(selectedIndex >= COLLAPSED_COUNT);
  const visible = expanded ? CATEGORIES : CATEGORIES.slice(0, COLLAPSED_COUNT);

  return (
    <div className={`category-field ${className}`.trim()}>
      <label>
        {label} <span className="hint">pick one or type your own</span>
        <input
          name="category"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={CATEGORY_MAX}
          autoComplete="off"
        />
      </label>
      <div className="category-chips" role="group" aria-label={`${label} suggestions`}>
        {visible.map((item) => {
          const selected = item.toLowerCase() === current;
          return (
            <button
              key={item}
              type="button"
              className={`category-chip${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          );
        })}
        <button type="button" className="category-chip more" onClick={() => setExpanded((open) => !open)}>
          {expanded ? 'Fewer types' : `More types (${CATEGORIES.length - COLLAPSED_COUNT})`}
        </button>
      </div>
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
