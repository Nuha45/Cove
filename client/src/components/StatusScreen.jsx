import CoveLogo from './brand/CoveLogo';

export function LoadingScreen({ message = 'Loading your workspace...' }) {
  return (
    <div className="status-screen">
      <CoveLogo />
      <p>{message}</p>
    </div>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <div className="status-screen">
      <CoveLogo />
      <h1>We could not load your workspace</h1>
      <p>{message}</p>
      <button className="primary" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
