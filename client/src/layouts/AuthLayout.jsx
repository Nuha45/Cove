import { Link } from 'react-router-dom';
import CoveLogo from '../components/brand/CoveLogo';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/login" className="brand auth-brand" aria-label="Cove">
          <CoveLogo />
        </Link>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
        {children}
        <p className="auth-footer">{footer}</p>
      </div>
    </div>
  );
}
