import { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { formatEyebrowDate } from '../utils/display';
import { copyText, storefrontPath, storefrontUrl } from '../utils/storefront';

export default function StorefrontPage() {
  const { business } = useAuth();
  const { notify } = useOutletContext();
  const [copying, setCopying] = useState(false);
  const slug = business?.slug || '';
  const url = storefrontUrl(slug);
  const path = storefrontPath(slug);

  async function handleCopy() {
    if (!url) return;
    setCopying(true);
    try {
      await copyText(url);
      notify('Storefront link copied.');
    } catch {
      notify('Could not copy the link. You can select it and copy manually.');
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Storefront"
        subtitle="Share this link so customers can browse and order without messaging you for every detail."
        action={
          slug ? (
            <a className="primary" href={path} target="_blank" rel="noreferrer">
              <ExternalLink size={16} /> Open store
            </a>
          ) : null
        }
      />

      <section className="card store-link-card">
        <p className="eyebrow">YOUR STOREFRONT</p>
        <h2>Share your shop link</h2>
        <p className="muted">Put this in your Instagram or WhatsApp bio. Orders land in your Orders page automatically.</p>
        <div className="store-link-row">
          <input readOnly value={url || path} aria-label="Storefront link" />
          <button className="secondary" type="button" onClick={handleCopy} disabled={!slug || copying}>
            <Copy size={15} /> {copying ? 'Copying...' : 'Copy link'}
          </button>
          <a className="secondary" href={path} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Open
          </a>
        </div>
      </section>

      <section className="store-preview card">
        <div className="store-preview-head">
          <div>
            <p className="eyebrow">PUBLIC PREVIEW</p>
            <h2>{business?.name || 'Your shop'}</h2>
            <p className="muted">Customers see your active products, add them to a cart, and check out as guests.</p>
          </div>
        </div>
        <div className="store-mock">
          <div className="mock-nav">
            <strong>{business?.name || 'Your shop'}</strong>
            <span>Shop · Cart</span>
          </div>
          <div className="mock-hero">
            <div>
              <p className="eyebrow">YOUR SHOP</p>
              <h2>
                Little things that
                <br />
                <i>feel like you.</i>
              </h2>
              <p>{business?.description || business?.category || 'Your story will appear here.'}</p>
            </div>
          </div>
          <h3>What customers do</h3>
          <EmptyState
            title="Browse, cart, checkout"
            text="They pick products, enter their details, and place the order. You manage it in Orders."
          />
        </div>
      </section>
    </>
  );
}
