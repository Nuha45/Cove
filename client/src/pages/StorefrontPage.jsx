import { ExternalLink } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { formatEyebrowDate } from '../utils/display';

export default function StorefrontPage() {
  const { business } = useAuth();
  const { notify } = useOutletContext();

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Storefront"
        subtitle="This is the shop your customers will see."
      />
      <section className="store-preview card">
        <div className="store-preview-head">
          <div>
            <p className="eyebrow">PUBLIC STOREFRONT</p>
            <h2>{business?.slug || 'your-shop'}.cove.store</h2>
            <p className="muted">Your customers will see a simple shop here. It is not public yet.</p>
          </div>
          <button className="primary" type="button" onClick={() => notify('The public shop will open in a later step.')}>
            <ExternalLink size={16} /> Open storefront
          </button>
        </div>
        <div className="store-mock">
          <div className="mock-nav">
            <strong>{business?.name || 'Your shop'}</strong>
            <span>Home　 Shop　 About</span>
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
          <h3>Shop our favorites</h3>
          <EmptyState title="No products yet" text="Add your first product and it will appear in this shop." />
        </div>
      </section>
    </>
  );
}
