import { useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ChevronRight,
  LifeBuoy,
  Mail,
  Rocket,
  RotateCcw,
  Search,
  ShoppingBag,
  Store,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import { HELP_CATEGORIES } from '../content/helpArticles';
import { LEGAL } from '../content/legal';
import { useAuth } from '../context/AuthContext';
import { formatEyebrowDate } from '../utils/display';

const CATEGORY_ICONS = {
  'getting-started': Rocket,
  orders: ShoppingBag,
  payments: Wallet,
  customers: Users,
  storefront: Store,
  business: BarChart3,
};

const FLAT_ARTICLES = HELP_CATEGORIES.flatMap((category) => category.articles.map((article) => ({
  ...article,
  categoryId: category.id,
  category: category.title,
})));

function matches(article, query) {
  return `${article.title} ${article.body}`.toLowerCase().includes(query);
}

export default function HelpPage() {
  const { business } = useAuth();
  const { notify, openOnboarding } = useOutletContext();
  const [activeId, setActiveId] = useState(FLAT_ARTICLES[0]?.id || '');
  const [query, setQuery] = useState('');
  const articleRef = useRef(null);

  const trimmedQuery = query.trim().toLowerCase();
  const visibleCategories = useMemo(() => {
    if (!trimmedQuery) return HELP_CATEGORIES;
    return HELP_CATEGORIES
      .map((category) => ({ ...category, articles: category.articles.filter((article) => matches(article, trimmedQuery)) }))
      .filter((category) => category.articles.length > 0);
  }, [trimmedQuery]);

  const activeIndex = FLAT_ARTICLES.findIndex((article) => article.id === activeId);
  const activeArticle = activeIndex >= 0 ? FLAT_ARTICLES[activeIndex] : null;
  const previousArticle = activeIndex > 0 ? FLAT_ARTICLES[activeIndex - 1] : null;
  const nextArticle = activeIndex >= 0 ? FLAT_ARTICLES[activeIndex + 1] : null;
  const relatedArticles = activeArticle
    ? FLAT_ARTICLES.filter((article) => article.categoryId === activeArticle.categoryId && article.id !== activeArticle.id)
    : [];
  const ActiveIcon = (activeArticle && CATEGORY_ICONS[activeArticle.categoryId]) || LifeBuoy;

  function openArticle(id) {
    setActiveId(id);
    // Topics stack above the article on narrow screens, so bring the answer into view.
    if (window.matchMedia?.('(max-width: 900px)').matches) {
      articleRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }

  function restartTour() {
    if (!business?.id) {
      notify('Please sign in again to restart the tour.');
      return;
    }
    // Help is already inside DashboardLayout, so open the modal immediately.
    // Do not gate this on product count — that only controls automatic first-time open.
    openOnboarding?.({ reset: true, step: 0 });
    notify('Welcome tour restarted.');
  }

  return (
    <>
      <PageIntro
        eyebrow={formatEyebrowDate()}
        title="Help & How Cove works"
        subtitle="Short answers so you can run your shop with confidence."
      />

      <div className="help-layout">
        <nav className="card help-nav" aria-label="Help topics">
          <label className="help-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search help"
              aria-label="Search help topics"
            />
            {query && (
              <button type="button" className="help-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>

          {visibleCategories.length === 0 ? (
            <p className="help-nav-empty">No topics match “{query.trim()}”.</p>
          ) : (
            visibleCategories.map((category) => {
              const Icon = CATEGORY_ICONS[category.id] || LifeBuoy;
              return (
                <div key={category.id} className="help-nav-group">
                  <p className="help-nav-heading">
                    <Icon size={15} aria-hidden="true" /> {category.title}
                  </p>
                  <ul>
                    {category.articles.map((article) => (
                      <li key={article.id}>
                        <button
                          type="button"
                          className={article.id === activeId ? 'selected' : ''}
                          aria-current={article.id === activeId ? 'true' : undefined}
                          onClick={() => openArticle(article.id)}
                        >
                          {article.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </nav>

        <div className="help-main">
          <article className="card help-article" ref={articleRef}>
            {activeArticle ? (
              <>
                <div className="help-article-head">
                  <span className="help-article-icon"><ActiveIcon size={18} aria-hidden="true" /></span>
                  <p>{activeArticle.category}</p>
                </div>
                <h2>{activeArticle.title}</h2>
                <p className="help-article-body">{activeArticle.body}</p>
                {activeArticle.action && (
                  <Link className="primary help-article-action" to={activeArticle.action.to}>
                    {activeArticle.action.label} <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                )}

                {relatedArticles.length > 0 && (
                  <div className="help-related">
                    <p className="help-section-label">More in {activeArticle.category}</p>
                    <ul>
                      {relatedArticles.map((article) => (
                        <li key={article.id}>
                          <button type="button" onClick={() => openArticle(article.id)}>
                            <span>{article.title}</span>
                            <ChevronRight size={16} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <nav className="help-pager" aria-label="Previous and next topics">
                  {previousArticle && (
                    <button type="button" className="help-pager-prev" onClick={() => openArticle(previousArticle.id)}>
                      <span><ArrowLeft size={13} aria-hidden="true" /> Previous</span>
                      <strong>{previousArticle.title}</strong>
                    </button>
                  )}
                  {nextArticle && (
                    <button type="button" className="help-pager-next" onClick={() => openArticle(nextArticle.id)}>
                      <span>Next <ArrowRight size={13} aria-hidden="true" /></span>
                      <strong>{nextArticle.title}</strong>
                    </button>
                  )}
                </nav>
              </>
            ) : (
              <p className="muted">Choose a topic to learn more.</p>
            )}
          </article>

          <section className="card help-support">
            <span className="help-support-icon"><LifeBuoy size={20} aria-hidden="true" /></span>
            <div className="help-support-text">
              <strong>Still need help?</strong>
              <p className="muted">Replay the welcome tour — it will not change your products or settings — or email the Cove team.</p>
            </div>
            <div className="help-support-actions">
              <button className="secondary" type="button" onClick={restartTour}>
                <RotateCcw size={15} aria-hidden="true" /> Restart welcome tour
              </button>
              <a className="secondary" href={`mailto:${LEGAL.SUPPORT_EMAIL}`}>
                <Mail size={15} aria-hidden="true" /> Email support
              </a>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
