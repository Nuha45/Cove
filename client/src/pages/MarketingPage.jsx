import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Sparkles } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import EmptyState from '../components/ui/EmptyState';
import { listProducts } from '../services/productService';
import { generateMarketing, getMarketingStatus } from '../services/marketingService';
import { formatEyebrowDate, formatPrice } from '../utils/display';
import { getErrorMessage } from '../utils/errors';

const CONTENT_TYPES = [
  'Instagram Caption',
  'WhatsApp Promotion',
  'Short Product Description',
];
const TONES = ['Friendly', 'Professional', 'Casual'];

export default function MarketingPage() {
  const navigate = useNavigate();
  const { notify } = useOutletContext();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [contentType, setContentType] = useState(CONTENT_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [configured, setConfigured] = useState(null);
  const [mockMode, setMockMode] = useState(false);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const [productResult, status] = await Promise.all([
          listProducts({ status: 'Active', limit: 24 }),
          getMarketingStatus(),
        ]);
        if (cancelled) return;
        const active = (productResult.products || []).filter((item) => item.status === 'Active');
        setProducts(active);
        setConfigured(Boolean(status.configured));
        setMockMode(Boolean(status.mockMode));
        if (active.length && !productId) {
          setProductId(active[0].id);
        }
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err));
        setLoadState('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = products.find((item) => item.id === productId) || null;

  async function handleGenerate() {
    if (!productId) {
      setActionError('Choose a product first.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const data = await generateMarketing({ productId, contentType, tone });
      setResult(data);
      setConfigured(true);
      setMockMode(Boolean(data.mockMode));
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!result?.content) return;
    try {
      await navigator.clipboard.writeText(result.content);
      notify('Copied to clipboard.');
    } catch {
      notify('Could not copy. Select the text instead.');
    }
  }

  if (loadState === 'loading') {
    return <div className="panel-state">Loading marketing tools...</div>;
  }

  if (loadState === 'error') {
    return (
      <div className="panel-state">
        <p className="form-error">{loadError}</p>
      </div>
    );
  }

  if (!products.length) {
    return (
      <>
        <PageIntro
          eyebrow={formatEyebrowDate()}
          title="AI Marketing"
          subtitle="Turn a product into a caption, WhatsApp promo, or short description."
        />
        <section className="card empty-card">
          <EmptyState
            title="Nothing to create yet"
            text="Add an active product first, then come back to generate marketing copy."
          />
          <button className="primary" type="button" onClick={() => navigate('/products', { state: { add: true } })}>
            Add product
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="AI Marketing"
        subtitle="Turn a product into a caption, WhatsApp promo, or short description."
      />

      {mockMode ? (
        <div className="marketing-callout marketing-callout-demo" role="status">
          <strong>Demo mode — sample content only. No AI API call or charge is made.</strong>
          <p>
            Cove is returning realistic sample copy from your product details. Turn off
            {' '}<code>AI_MOCK_MODE</code> in <code>server/.env</code> and add an OpenAI key when you want live generation.
          </p>
        </div>
      ) : null}

      {!mockMode && configured === false ? (
        <div className="marketing-callout" role="status">
          <strong>AI is not configured yet</strong>
          <p>
            Add an OpenAI API key on the server to generate content. Your product details stay on Cove until then.
          </p>
        </div>
      ) : null}

      <div className="marketing-layout">
        <section className="card marketing-form-card">
          <label className="field">
            <span>Product</span>
            <select
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setResult(null);
              }}
              aria-label="Select product"
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </label>

          {selected ? (
            <div className="marketing-product">
              <div>
                <span>Name</span>
                <strong>{selected.name}</strong>
              </div>
              <div>
                <span>Price</span>
                <strong>{formatPrice(selected.price)}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{selected.category || 'General'}</strong>
              </div>
              <div className="wide">
                <span>Description</span>
                <p>{selected.description?.trim() || 'No description yet.'}</p>
              </div>
            </div>
          ) : null}

          <label className="field">
            <span>Content type</span>
            <select
              value={contentType}
              onChange={(event) => setContentType(event.target.value)}
              aria-label="Content type"
            >
              {CONTENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>

          <label className="field">
            <span>Tone</span>
            <select value={tone} onChange={(event) => setTone(event.target.value)} aria-label="Tone">
              {TONES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          {actionError ? <p className="form-error">{actionError}</p> : null}

          <button
            className="primary marketing-generate"
            type="button"
            disabled={busy || configured === false}
            onClick={handleGenerate}
          >
            <Sparkles size={17} />
            {busy ? 'Generating...' : 'Generate'}
          </button>
        </section>

        <section className="card marketing-result-card">
          <div className="section-head">
            <h2>Generated content</h2>
          </div>
          {!result ? (
            <EmptyState
              title="Ready when you are"
              text="Pick a product and content type, then generate copy you can paste into Instagram or WhatsApp."
            />
          ) : (
            <>
              <div className="marketing-result-meta">
                <span>{result.contentType}</span>
                <span>{result.tone}</span>
                <span>{result.product?.name}</span>
              </div>
              <div className="marketing-result-text">{result.content}</div>
              <div className="marketing-result-actions">
                <button className="secondary" type="button" onClick={handleCopy}>
                  <Copy size={16} /> Copy
                </button>
                <button className="secondary" type="button" disabled={busy} onClick={handleGenerate}>
                  <RefreshCw size={16} /> Regenerate
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
