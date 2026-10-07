import { Component } from 'react';

/**
 * Production-safe React Error Boundary.
 * Renders a clean user-facing fallback card without exposing raw error messages,
 * stack traces, or component internals.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      // In development, log for debugging convenience
      console.error('ErrorBoundary caught an unhandled render error:', error, errorInfo);
    }
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title = this.props.title || 'Something went wrong';
      const message =
        this.props.message ||
        'An unexpected error occurred while displaying this page. Please reload to try again.';

      return (
        <main
          className="store-status"
          role="alert"
          style={{ maxWidth: '480px', margin: '4rem auto', padding: '2rem', textAlign: 'center' }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>{title}</h1>
          <p style={{ color: 'var(--text-muted, #64748b)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {message}
          </p>
          <button className="primary" type="button" onClick={this.handleReset}>
            Reload page
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
