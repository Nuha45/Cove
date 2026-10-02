import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../../components/marketing/SiteChrome';
import { useAuth } from '../../context/AuthContext';
import { LEGAL, LEGAL_LINKS } from '../../content/legal';
import { absoluteUrl, useSeo } from '../../utils/seo';

export function SupportEmail() {
  return <a href={`mailto:${LEGAL.SUPPORT_EMAIL}`}>{LEGAL.SUPPORT_EMAIL}</a>;
}

export function ContactBlock() {
  return (
    <address className="legal-contact">
      <strong>Cove</strong>
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
            <p>Effective date: {LEGAL.EFFECTIVE_DATE}</p>
          </header>
          {children}
        </article>
      </main>
      <SiteFooter signedIn={signedIn} />
    </div>
  );
}
