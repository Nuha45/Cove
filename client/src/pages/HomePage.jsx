import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  ClipboardList,
  Package,
  Palette,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/marketing/SiteChrome';
import {
  StoreBrandContent,
  StoreFeaturedCategories,
  StoreHero,
  StoreProductCard,
} from '../components/storefront/StoreSections';
import { useAuth } from '../context/AuthContext';
import { PLAN_DETAILS } from '../utils/billing';
import { STOREFRONT_THEMES, storeThemeProps } from '../utils/storefrontAppearance';
import { absoluteAsset, absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_TITLE, homeJsonLd, useSeo } from '../utils/seo';

const PREVIEW_ACCENTS = {
  warm: '#FF7A3D',
  minimal: '#3F6F5B',
  editorial: '#b6504a',
  modern: '#476b9b',
  bold: '#1F2937',
};

// Sample catalog for the illustration only; it is labelled as a sample on the page.
const SAMPLE_PRODUCTS = [
  { id: 's1', name: 'Hand-poured candle', category: 'Home', price: 450 },
  { id: 's2', name: 'Linen tote bag', category: 'Bags', price: 890 },
  { id: 's3', name: 'Brass leaf earrings', category: 'Jewellery', price: 1250 },
  { id: 's4', name: 'Stoneware mug', category: 'Home', price: 650 },
].map((item) => ({ ...item, images: [], available: true, stockAvailability: 'In stock' }));

const STEPS = [
  {
    title: 'Create your store',
    text: 'Sign up, name your shop and choose a look. Your storefront is ready straight away.',
  },
  {
    title: 'Add your products',
    text: 'Add photos, prices, categories and stock. Stock goes down on its own as orders come in.',
  },
  {
    title: 'Share your link',
    text: 'Send your store link on WhatsApp, Instagram or anywhere your customers already are.',
  },
  {
    title: 'Manage your orders',
    text: 'Confirm, prepare and complete orders, and mark them paid once the money reaches you.',
  },
];

const FEATURES = [
  {
    icon: Palette,
    title: 'A storefront that is ready',
    text: 'Choose a theme and an accent color. Your store looks polished on phones and laptops without any design work.',
  },
  {
    icon: Package,
    title: 'Products and stock',
    text: 'Photos, prices, categories and stock levels in one list, with sold-out items marked for customers.',
  },
  {
    icon: Truck,
    title: 'Pickup or delivery',
    text: 'Offer pickup, delivery or both, and set your own delivery fee. Customers choose at checkout.',
  },
  {
    icon: Wallet,
    title: 'Get paid your way',
    text: 'Share a UPI QR code, a payment link, payment instructions or take payment on pickup. Money goes straight to you.',
  },
  {
    icon: ClipboardList,
    title: 'Orders customers can follow',
    text: 'Every order gets a confirmation page your customer can come back to, showing its latest status.',
  },
  {
    icon: Users,
    title: 'Customers and requests',
    text: 'Your customer list builds itself from orders, and shoppers can request products you do not stock yet.',
  },
  {
    icon: Bell,
    title: 'Email alerts',
    text: 'Get an email when a new order arrives or a customer submits payment details, so nothing waits on you.',
  },
  {
    icon: BarChart3,
    title: 'Sales at a glance',
    text: 'See orders and revenue over time. Cove Plus adds visitor, product view and add-to-cart insights.',
  },
];

const PLANS = [
  { key: 'pro', name: 'Cove Basic', price: '₹599' },
  { key: 'advanced', name: 'Cove Plus', price: '₹899', featured: true },
];

function StorePreview() {
  const [themeId, setThemeId] = useState('warm');
  const appearance = { theme: themeId, accent: PREVIEW_ACCENTS[themeId], background: '' };
  const theme = STOREFRONT_THEMES.find((item) => item.id === themeId);

  return (
    <figure className="home-preview">
      <div className="home-preview-tabs" role="group" aria-label="Preview a storefront theme">
        {STOREFRONT_THEMES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === themeId ? 'active' : ''}
            aria-pressed={item.id === themeId}
            onClick={() => setThemeId(item.id)}
          >
            {item.label}
            {item.plus ? <span className="home-plus-tag">Plus</span> : null}
          </button>
        ))}
      </div>
      <div className="home-preview-frame">
        <div className="home-preview-bar" aria-hidden="true">
          <span />
          <span />
          <span />
          <em>your-shop</em>
        </div>
        <div className="store-appear-preview home-preview-store" {...storeThemeProps(appearance)} aria-hidden="true" inert="">
          <header className="store-top">
            <div className="store-top-inner">
              <div className="store-brand">
                <StoreBrandContent business={{ name: 'Your Shop', city: 'Your city' }} />
              </div>
              <span className="store-cart-link">
                <Package size={16} />
                <span>Cart</span>
              </span>
            </div>
          </header>
          <div className="store-main">
            <StoreHero
              category="Handmade goods"
              title="Your Shop"
              lead="A short line about what you make and sell."
              metaBits={['Pickup available', 'Delivery available']}
            />
            <StoreFeaturedCategories categories={['Home', 'Bags', 'Jewellery']} />
            <section className="store-catalog">
              <div className="store-catalog-head">
                <div>
                  <h2>Collection</h2>
                </div>
              </div>
              <div className="store-grid">
                {SAMPLE_PRODUCTS.map((product) => (
                  <StoreProductCard key={product.id} product={product} currency="INR" />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      <figcaption>
        {theme?.label} theme{theme?.plus ? ' · included with Cove Plus' : ''}. Sample shop shown for illustration.
      </figcaption>
    </figure>
  );
}

export default function HomePage() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';

  useSeo({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: absoluteUrl('/'),
    image: absoluteAsset('/cove-mark.png'),
    imageAlt: 'Cove',
    twitterCard: 'summary',
    jsonLd: homeJsonLd(),
  });

  useEffect(() => {
    document.documentElement.classList.add('home-scroll');
    return () => document.documentElement.classList.remove('home-scroll');
  }, []);

  // Section links from other pages (for example /#pricing) arrive before the section exists.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="home-page">
      <a className="skip-link" href="#home-main">Skip to content</a>
      <SiteHeader signedIn={signedIn} onHome />

      <main id="home-main">
        <section className="home-hero">
          <div className="home-container home-hero-inner">
            <p className="home-eyebrow">Online stores for independent sellers</p>
            <h1>Your business, beautifully simple.</h1>
            <p className="home-lead">
              Cove gives you a finished online storefront and the tools to run it — products, orders,
              customers and payments, all in one calm place.
            </p>
            <div className="home-hero-actions">
              <Link className="primary home-button home-button-lg" to={signedIn ? '/dashboard' : '/register'}>
                {signedIn ? 'Go to dashboard' : 'Start selling'} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a className="secondary home-button home-button-lg" href="#how-it-works">See how it works</a>
            </div>
            <p className="home-hero-note">7-day free trial · No card needed to start</p>
          </div>
          <div className="home-container">
            <StorePreview />
          </div>
        </section>

        <section className="home-section" id="how-it-works" aria-labelledby="how-title">
          <div className="home-container">
            <div className="home-section-head">
              <p className="home-eyebrow">How it works</p>
              <h2 id="how-title">From sign-up to your first order</h2>
            </div>
            <ol className="home-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="home-step-number" aria-hidden="true">{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="home-section home-section-soft" id="features" aria-labelledby="features-title">
          <div className="home-container">
            <div className="home-section-head">
              <p className="home-eyebrow">Features</p>
              <h2 id="features-title">Everything a small shop needs, nothing it doesn&apos;t</h2>
            </div>
            <div className="home-features">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="home-feature">
                    <span className="home-feature-icon" aria-hidden="true"><Icon size={18} /></span>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="home-section" id="pricing" aria-labelledby="pricing-title">
          <div className="home-container">
            <div className="home-section-head">
              <p className="home-eyebrow">Pricing</p>
              <h2 id="pricing-title">Simple monthly plans</h2>
              <p className="home-section-lead">
                Every new store starts with a 7-day free trial that includes all Cove Plus features.
                Nothing is charged unless you choose a plan.
              </p>
            </div>
            <div className="home-plans">
              {PLANS.map((plan) => {
                const details = PLAN_DETAILS[plan.key];
                return (
                  <article key={plan.key} className={`home-plan${plan.featured ? ' featured' : ''}`}>
                    <div className="home-plan-head">
                      <h3>{plan.name}</h3>
                      {plan.featured ? <span className="home-plan-badge">Most complete</span> : null}
                    </div>
                    <p className="home-plan-price">{plan.price}<span>/month</span></p>
                    <p className="home-plan-lead">{details.lead}</p>
                    <ul>
                      {details.features.map((feature) => (
                        <li key={feature}>
                          <Check size={15} aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      className={`${plan.featured ? 'primary' : 'secondary'} home-button home-button-lg`}
                      to={signedIn ? '/billing' : '/register'}
                    >
                      {signedIn ? 'View plans' : 'Start free trial'}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="home-plans-note">Prices in Indian rupees. Cancel anytime; you keep your plan until the paid month ends.</p>
          </div>
        </section>

        <section className="home-section home-section-soft" aria-labelledby="why-title">
          <div className="home-container home-why">
            <div>
              <p className="home-eyebrow">Why Cove</p>
              <h2 id="why-title">A finished store, not a website project</h2>
            </div>
            <div className="home-why-copy">
              <p>
                Cove is made for people who would rather spend their time making and selling than building a
                website. You get a storefront that already looks good and simple tools for the everyday work
                of running a shop.
              </p>
              <ul>
                <li><Check size={15} aria-hidden="true" /> No design or code needed</li>
                <li><Check size={15} aria-hidden="true" /> Customer payments go directly to you</li>
                <li><Check size={15} aria-hidden="true" /> Your products, orders and customers stay in one place</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="home-cta" aria-labelledby="cta-title">
          <div className="home-container home-cta-inner">
            <h2 id="cta-title">Ready to open your store?</h2>
            <p>Start your 7-day free trial today.</p>
            <Link className="primary home-button home-button-lg" to={signedIn ? '/dashboard' : '/register'}>
              {signedIn ? 'Go to dashboard' : 'Start selling'} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter signedIn={signedIn} onHome />
    </div>
  );
}
