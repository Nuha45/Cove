import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, BookOpen, RotateCcw } from 'lucide-react';
import PageIntro from '../components/ui/PageIntro';
import { HELP_CATEGORIES } from '../content/helpArticles';
import { useAuth } from '../context/AuthContext';
import { formatEyebrowDate } from '../utils/display';

export default function HelpPage() {
  const { business } = useAuth();
  const { notify, openOnboarding } = useOutletContext();
  const [activeId, setActiveId] = useState(HELP_CATEGORIES[0]?.articles[0]?.id || '');

  const flatArticles = useMemo(
    () => HELP_CATEGORIES.flatMap((category) => category.articles.map((article) => ({ ...article, category: category.title }))),
    [],
  );
  const activeIndex = flatArticles.findIndex((article) => article.id === activeId);
  const activeArticle = activeIndex >= 0 ? flatArticles[activeIndex] : null;
  const nextArticle = activeIndex >= 0 ? flatArticles[activeIndex + 1] : null;

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

      <section className="card help-restart-card">
        <div>
          <strong>New here?</strong>
          <p className="muted">Replay the welcome tour anytime. It will not change your products or settings.</p>
        </div>
        <div className="help-restart-actions">
          <button className="secondary" type="button" onClick={restartTour}>
            <RotateCcw size={15} aria-hidden="true" /> Restart welcome tour
          </button>
          <Link className="secondary" to="/storefront">
            <BookOpen size={15} aria-hidden="true" /> Open storefront
          </Link>
        </div>
      </section>

      <div className="help-layout">
        <nav className="card help-nav" aria-label="Help topics">
          {HELP_CATEGORIES.map((category) => (
            <div key={category.id} className="help-nav-group">
              <p className="eyebrow">{category.title}</p>
              <ul>
                {category.articles.map((article) => (
                  <li key={article.id}>
                    <button
                      type="button"
                      className={article.id === activeId ? 'selected' : ''}
                      aria-current={article.id === activeId ? 'true' : undefined}
                      onClick={() => setActiveId(article.id)}
                    >
                      {article.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <article className="card help-article">
          {activeArticle ? (
            <>
              <p className="eyebrow">{activeArticle.category}</p>
              <h2>{activeArticle.title}</h2>
              <p className="help-article-body">{activeArticle.body}</p>
              <div className="help-article-footer">
                <p className="muted">Still stuck? Replay the welcome tour above.</p>
                {nextArticle && (
                  <button type="button" className="help-article-next" onClick={() => setActiveId(nextArticle.id)}>
                    Next: {nextArticle.title} <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Choose a topic to learn more.</p>
          )}
        </article>
      </div>
    </>
  );
}
