import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../../components/marketing/SiteChrome';
import { useAuth } from '../../context/AuthContext';
import { isPlaceholder, LEGAL, LEGAL_LINKS } from '../../content/legal';
import { absoluteUrl, useSeo } from '../../utils/seo';

// Renders a LEGAL value, visibly marked while it is still a placeholder.
export function L({ k }) {
  const value = LEGAL[k];
  if (isPlaceholder(value)) return <mark className="legal-placeholder">{value}</mark>;
  return value;
}

export function SupportEmail() {
  if (isPlaceholder(LEGAL.supportEmail)) return <L k="supportEmail" />;
  return <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>;
}

export function ContactBlock() {
  return (
    <address className="legal-contact">
      <strong><L k="businessName" /></strong>
      <span><L k="address" /></span>
      <span>Email: <SupportEmail /></span>
    </address>
  );
}

export default function LegalLayout({ path, title, description, children }) {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  useSeo({ title: `${title} · Cove`, description, canonical: absoluteUrl(path) });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [path]);

  return (
    <div className="home-page legal-page">
      <a className="skip-link" href="#legal-main">Skip to content</a>
      <SiteHeader signedIn={signedIn} />
      <main id="legal-main" className="home-container legal-main">
        <nav className="legal-tabs" aria-label="Legal pages">
          {LEGAL_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to}>{link.label}</NavLink>
          ))}
        </nav>
        <article className="legal-article">
          <header className="legal-head">
            <h1>{title}</h1>
            <p>Effective date: <L k="effectiveDate" /></p>
          </header>
          {children}
        </article>
      </main>
      <SiteFooter signedIn={signedIn} />
    </div>
  );
}
