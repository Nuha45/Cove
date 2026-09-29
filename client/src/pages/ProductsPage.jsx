import { useEffect, useState } from 'react';
import { Download, ImagePlus, MoreHorizontal, Package, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import PageIntro from '../components/ui/PageIntro';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import ContextualHelp from '../components/ui/ContextualHelp';
import ProductModal from '../components/products/ProductModal';
import ArchiveDialog from '../components/products/ArchiveDialog';
import BulkActions, { BULK_LIMIT } from '../components/products/BulkActions';
import { downloadProductsCsv, listProducts, updateProduct } from '../services/productService';
import { formatEyebrowDate, formatPrice, formatUpdated } from '../utils/display';
import { getErrorMessage } from '../utils/errors';
import { mediaUrl } from '../utils/media';

const STATUS_TONE = {
  Active: 'green',
  Draft: 'yellow',
  Archived: 'neutral',
};

export default function ProductsPage() {
  const { notify, plan } = useOutletContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const [openMenu, setOpenMenu] = useState('');
  const [actionError, setActionError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState([]);
  const [exporting, setExporting] = useState(false);
  const canBulk = Boolean(plan?.advanced) && status !== 'Archived';
  const selectedIds = new Set(selected.map((item) => item.id));

  useEffect(() => {
    setSelected([]);
  }, [query, status, category]);

  function toggleSelected(product) {
    setSelected((current) => {
      if (current.some((item) => item.id === product.id)) {
        return current.filter((item) => item.id !== product.id);
      }
      if (current.length >= BULK_LIMIT) {
        notify(`You can select up to ${BULK_LIMIT} products at a time.`);
        return current;
      }
      return [...current, { id: product.id, name: product.name }];
    });
  }

  const selectable = products.filter((product) => product.status !== 'Archived');
  const allOnPageSelected = selectable.length > 0 && selectable.every((product) => selectedIds.has(product.id));

  function togglePage() {
    setSelected((current) => {
      if (allOnPageSelected) {
        const pageIds = new Set(selectable.map((product) => product.id));
        return current.filter((item) => !pageIds.has(item.id));
      }
      const next = [...current];
      selectable.forEach((product) => {
        if (next.length < BULK_LIMIT && !next.some((item) => item.id === product.id)) {
          next.push({ id: product.id, name: product.name });
        }
      });
      return next;
    });
  }

  async function exportCsv(ids = []) {
    setExporting(true);
    try {
      await downloadProductsCsv(ids);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  function handleBulkDone(result) {
    const count = result.modified;
    notify(count === 0
      ? 'No products needed changes.'
      : `Updated ${count} ${count === 1 ? 'product' : 'products'}.`);
    setSelected([]);
    setReloadKey((current) => current + 1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!openMenu) return undefined;
    function close() {
      setOpenMenu('');
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openMenu]);

  useEffect(() => {
    if (!location.state?.add) return;
    setAdding(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setLoadError('');
      try {
        const result = await listProducts({
          search: query || undefined,
          status: status || undefined,
          category: category || undefined,
          page,
          limit: 12,
        });
        if (cancelled) return;
        setProducts(result.products);
        setCategories(result.categories);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) setPage(result.page);
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
  }, [query, status, category, page, reloadKey]);

  function refresh() {
    setReloadKey((current) => current + 1);
  }

  async function restore(product) {
    setActionError('');
    try {
      await updateProduct(product.id, { status: 'Active' });
      notify(`${product.name} is active again.`);
      setOpenMenu('');
      setStatus('');
      setPage(1);
      setReloadKey((current) => current + 1);
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  }

  function handleSaved(product, mode) {
    setAdding(false);
    setEditing(null);
    notify(mode === 'created' ? `${product.name} was added.` : `${product.name} was saved.`);
    if (mode === 'created') {
      setSearch('');
      setQuery('');
      setStatus('');
      setCategory('');
      setPage(1);
    }
    setReloadKey((current) => current + 1);
  }

  const emptyBecauseFilter = total === 0 && (query || status || category);

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Products"
        subtitle={(
          <span className="subtitle-with-help">
            Products are what customers see in your storefront.
            <ContextualHelp text="Active products appear on your public shop. Drafts stay private until you publish them." />
          </span>
        )}
        action={
          <button className="primary" type="button" onClick={() => setAdding(true)}>
            <Plus size={17} /> Add product
          </button>
        }
      />

      <section className="card table-card">
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
            />
          </div>
          <div className="tool-filters">
            <select
              className="filter-select"
              aria-label="Filter by category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              className="filter-select"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Active and drafts</option>
              <option value="Active">Active</option>
              <option value="Draft">Draft</option>
              <option value="Archived">Archived</option>
              <option value="all">All statuses</option>
            </select>
            {plan?.advanced ? (
              <button className="secondary tiny" type="button" onClick={() => exportCsv()} disabled={exporting}>
                <Download size={14} /> {exporting && selected.length === 0 ? 'Exporting...' : 'Export CSV'}
              </button>
            ) : null}
          </div>
        </div>

        {canBulk && selected.length > 0 ? (
          <BulkActions
            selected={selected}
            onClear={() => setSelected([])}
            onDone={handleBulkDone}
            onExport={() => exportCsv(selected.map((item) => item.id))}
            exporting={exporting}
          />
        ) : null}

        {loadState === 'loading' ? (
          <div className="panel-state">Loading your products...</div>
        ) : null}

        {loadState === 'error' ? (
          <div className="panel-state">
            <p className="form-error">{loadError}</p>
            <button className="secondary" type="button" onClick={refresh}>Try again</button>
          </div>
        ) : null}

        {loadState === 'ready' && actionError ? <p className="form-error page-error">{actionError}</p> : null}

        {loadState === 'ready' && products.length === 0 ? (
          <div className="panel-state">
            <EmptyState
              title={emptyBecauseFilter ? 'No matching products' : 'Your storefront is waiting for its first product'}
              text={emptyBecauseFilter
                ? 'Try a different search or filter.'
                : 'Add your first product to start building your shop.'}
            />
            {!emptyBecauseFilter ? (
              <button className="primary" type="button" onClick={() => setAdding(true)}>
                <Plus size={17} /> Add your first product
              </button>
            ) : null}
          </div>
        ) : null}

        {loadState === 'ready' && products.length > 0 ? (
          <>
            <div className="list-summary">{total} {total === 1 ? 'product' : 'products'}</div>
            <div className="product-table">
              <div className="table-head">
                {canBulk ? (
                  <span className="select-head">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      aria-label="Select all products on this page"
                    />
                    Product
                  </span>
                ) : <span>Product</span>}
                <span>Category</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Status</span>
                <span />
              </div>
              {products.map((product) => (
                <div className={`table-row${selectedIds.has(product.id) ? ' row-selected' : ''}`} key={product.id}>
                  <div className="product-cell">
                    {canBulk ? (
                      <input
                        type="checkbox"
                        className="row-check"
                        checked={selectedIds.has(product.id)}
                        disabled={product.status === 'Archived'}
                        onChange={() => toggleSelected(product)}
                        aria-label={`Select ${product.name}`}
                      />
                    ) : null}
                    <ProductThumb product={product} />
                    <div>
                      <strong>{product.name}</strong>
                      <small>{formatUpdated(product.updatedAt)}</small>
                    </div>
                  </div>
                  <span>{product.category || '—'}</span>
                  <strong>{formatPrice(product.price)}</strong>
                  <span className={stockClass(product.stockQuantity)}>{product.stockQuantity}</span>
                  <Badge tone={STATUS_TONE[product.status] || 'neutral'}>{product.status}</Badge>
                  <ProductMenu
                    product={product}
                    open={openMenu === product.id}
                    onToggle={() => setOpenMenu((current) => (current === product.id ? '' : product.id))}
                    onEdit={() => {
                      setOpenMenu('');
                      setEditing(product);
                    }}
                    onArchive={() => {
                      setOpenMenu('');
                      setArchiving(product);
                    }}
                    onRestore={() => restore(product)}
                  />
                </div>
              ))}
            </div>

            <div className="product-cards">
              {products.map((product) => (
                <article className={`product-card${canBulk ? ' selectable' : ''}${selectedIds.has(product.id) ? ' row-selected' : ''}`} key={product.id}>
                  {canBulk ? (
                    <input
                      type="checkbox"
                      className="row-check card-check"
                      checked={selectedIds.has(product.id)}
                      disabled={product.status === 'Archived'}
                      onChange={() => toggleSelected(product)}
                      aria-label={`Select ${product.name}`}
                    />
                  ) : null}
                  <ProductThumb product={product} large />
                  <div>
                    <strong>{product.name}</strong>
                    <small>{product.category || 'No category'} · {formatUpdated(product.updatedAt)}</small>
                    <div className="product-card-meta">
                      <strong>{formatPrice(product.price)}</strong>
                      <span className={stockClass(product.stockQuantity)}>{product.stockQuantity} in stock</span>
                      <Badge tone={STATUS_TONE[product.status] || 'neutral'}>{product.status}</Badge>
                    </div>
                  </div>
                  <div className="product-card-actions">
                    <button className="secondary" type="button" onClick={() => setEditing(product)}>Edit</button>
                    {product.status === 'Archived' ? (
                      <button className="secondary" type="button" onClick={() => restore(product)}>Restore</button>
                    ) : (
                      <button className="secondary" type="button" onClick={() => setArchiving(product)}>Archive</button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {status === 'Archived' ? (
              <p className="archive-note">Archived products are hidden from your active list. Restore one if you want to sell it again.</p>
            ) : (
              <div className="empty-hint">
                <ImagePlus size={18} />
                <div>
                  <strong>Have more products to add?</strong>
                  <p>Bring your whole catalog online in minutes.</p>
                </div>
                <button className="secondary" type="button" onClick={() => setAdding(true)}>Add product</button>
              </div>
            )}

            {totalPages > 1 ? (
              <div className="pager">
                <button className="secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button className="secondary" type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {adding ? (
        <ProductModal
          onClose={() => setAdding(false)}
          onSaved={handleSaved}
        />
      ) : null}
      {editing ? (
        <ProductModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {archiving ? (
        <ArchiveDialog
          product={archiving}
          onClose={() => setArchiving(null)}
          onArchived={(product) => {
            setArchiving(null);
            notify(`${product.name} was archived.`);
            setReloadKey((current) => current + 1);
          }}
        />
      ) : null}
    </>
  );
}

function stockClass(quantity) {
  if (quantity === 0) return 'stock-out';
  if (quantity <= 3) return 'stock-alert';
  return '';
}

function ProductThumb({ product, large = false }) {
  const src = product.images?.[0];
  if (!src) {
    return (
      <span className={large ? 'thumb-fallback large' : 'thumb-fallback'} aria-hidden="true">
        <Package size={large ? 22 : 16} />
      </span>
    );
  }
  return <img src={mediaUrl(src)} alt="" />;
}

function ProductMenu({ product, open, onToggle, onEdit, onArchive, onRestore }) {
  return (
    <div className="row-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button className="row-more" type="button" aria-label={`Options for ${product.name}`} onClick={onToggle}>
        <MoreHorizontal size={17} />
      </button>
      {open ? (
        <div className="row-menu-panel">
          <button type="button" onClick={onEdit}>Edit</button>
          {product.status === 'Archived' ? (
            <button type="button" onClick={onRestore}>Restore</button>
          ) : (
            <button type="button" onClick={onArchive}>Archive</button>
          )}
        </div>
      ) : null}
    </div>
  );
}
