import { useEffect, useState } from 'react';

export const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
];

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function RangePicker({ value, onChange }) {
  const [from, setFrom] = useState(value.from || '');
  const [to, setTo] = useState(value.to || '');
  const [error, setError] = useState('');
  const max = todayString();

  useEffect(() => {
    setFrom(value.from || '');
    setTo(value.to || '');
  }, [value.from, value.to]);

  function selectRange(event) {
    const range = event.target.value;
    setError('');
    if (range === 'custom') {
      const start = from || max;
      const end = to || max;
      setFrom(start);
      setTo(end);
      onChange({ range, from: start, to: end });
      return;
    }
    onChange({ range });
  }

  function applyCustom(event) {
    event.preventDefault();
    if (!from || !to) {
      setError('Choose a start and end date.');
      return;
    }
    if (from > to) {
      setError('The start date must be before the end date.');
      return;
    }
    setError('');
    onChange({ range: 'custom', from, to });
  }

  return (
    <div className="range-picker">
      <select className="filter-select" aria-label="Date range" value={value.range} onChange={selectRange}>
        {RANGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {value.range === 'custom' ? (
        <form className="range-custom" onSubmit={applyCustom}>
          <label>
            <span className="sr-only">Start date</span>
            <input type="date" value={from} max={max} onChange={(event) => setFrom(event.target.value)} aria-label="Start date" />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="sr-only">End date</span>
            <input type="date" value={to} max={max} onChange={(event) => setTo(event.target.value)} aria-label="End date" />
          </label>
          <button className="secondary tiny" type="submit">Apply</button>
        </form>
      ) : null}
      {error ? <p className="form-error range-error" role="alert">{error}</p> : null}
    </div>
  );
}
