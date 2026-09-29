function pct(value) {
  return value === null || value === undefined ? null : `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export default function Funnel({ steps }) {
  const first = steps[0]?.value || 0;
  return (
    <ol className="funnel">
      {steps.map((step, index) => {
        const width = first > 0 ? Math.min(100, Math.max(2, (step.value / first) * 100)) : 2;
        const share = pct(step.ofPrevious);
        return (
          <li key={step.key}>
            <div className="funnel-label">
              <span>{step.label}</span>
              <strong>{step.value.toLocaleString('en-IN')}</strong>
            </div>
            <div className="funnel-track" aria-hidden="true">
              <div className="funnel-bar" style={{ width: `${width}%` }} />
            </div>
            {index > 0 ? (
              <small className="funnel-rate">
                {share ? `${share} of previous step` : 'No previous activity'}
              </small>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
