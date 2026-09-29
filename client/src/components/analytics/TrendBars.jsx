// CSS bar chart shared with the basic sales trend. Values come straight from the API.
export default function TrendBars({ points, format = (value) => String(value), ariaLabel }) {
  const max = Math.max(...points.map((point) => point.value), 0);
  const dense = points.length > 10;
  const labelEvery = points.length > 20 ? Math.ceil(points.length / 8) : dense ? 2 : 1;

  if (!points.length) return null;

  return (
    <div className="trend-scroll">
      <div
        className={`trend-chart${dense ? ' dense' : ''}`}
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(${dense ? 10 : 0}px, 1fr))` }}
        role="img"
        aria-label={ariaLabel}
      >
        {points.map((point, index) => {
          const height = max > 0 ? Math.max(4, Math.round((point.value / max) * 100)) : 4;
          return (
            <div key={point.key} className="trend-col">
              <div className="trend-bar-wrap">
                <div
                  className={`trend-bar${point.value === 0 ? ' empty' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`${point.label}: ${format(point.value)}`}
                />
              </div>
              {!dense ? <strong>{format(point.value)}</strong> : null}
              <span className={index % labelEvery === 0 ? '' : 'trend-label-hidden'}>{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
