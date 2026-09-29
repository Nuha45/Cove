import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import CoveLogo from '../brand/CoveLogo';
import { LEGAL_LINKS } from '../../content/legal';

const SECTIONS = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'pricing', label: 'Pricing' },
];

// On the homepage, section links are in-page anchors; elsewhere they route back to the homepage.
function SectionLink({ id, onHome, onClick, children }) {
  if (onHome) return <a href={`#${id}`} onClick={onClick}>{children}</a>;
  return <Link to={`/#${id}`} onClick={onClick}>{children}</Link>;
}

export function SiteHeader({ signedIn, onHome = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="home-header">
      <div className="home-container home-header-inner">
        <Link to="/" className="home-brand" aria-label="Cove home" onClick={close}>
          <CoveLogo size={30} />
        </Link>
        <nav className={`home-nav${menuOpen ? ' open' : ''}`} id="home-nav" aria-label="Main">
          {SECTIONS.map((section) => (
            <SectionLink key={section.id} id={section.id} onHome={onHome} onClick={close}>
              {section.label}
            </SectionLink>
          ))}
          <div className="home-nav-actions">
            {signedIn ? (
              <Link className="primary home-button" to="/dashboard" onClick={close}>Go to dashboard</Link>
            ) : (
              <>
                <Link className="home-login" to="/login" onClick={close}>Log in</Link>
                <Link className="primary home-button" to="/register" onClick={close}>Start selling</Link>
              </>
            )}
          </div>
        </nav>
        <button
          className="home-menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="home-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
    </header>
  );
}

export function SiteFooter({ signedIn, onHome = false }) {
  return (
    <footer className="home-footer">
      <div className="home-container home-footer-inner">
        <div className="home-footer-brand">
          <CoveLogo size={26} />
          <p>Online stores for independent sellers.</p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          {SECTIONS.map((section) => (
            <SectionLink key={section.id} id={section.id} onHome={onHome}>{section.label}</SectionLink>
          ))}
        </nav>
        <nav aria-label="Account">
          <strong>Account</strong>
          {signedIn ? (
            <Link to="/dashboard">Dashboard</Link>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Start selling</Link>
            </>
          )}
        </nav>
        <nav aria-label="Legal">
          <strong>Legal</strong>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.to} to={link.to}>{link.label}</Link>
          ))}
        </nav>
      </div>
      <div className="home-container home-footer-base">
        <small>© {new Date().getFullYear()} Cove</small>
      </div>
    </footer>
  );
}
