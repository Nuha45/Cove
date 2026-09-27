import { useEffect } from 'react';

export const SITE_NAME = 'Cove';
export const DEFAULT_TITLE = 'Cove — Online storefronts for small businesses';
export const DEFAULT_DESCRIPTION =
  'Cove helps small businesses sell online with a simple storefront, orders, and customer requests in one place.';
export const PRIVATE_TITLE = 'Cove';

const INDEXABLE_PATHS = [
  /^\/store\/[^/]+\/?$/,
  /^\/store\/[^/]+\/product\/[^/]+\/?$/,
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const JSON_LD_ID = 'cove-jsonld';

export function isIndexablePath(pathname = '') {
  return INDEXABLE_PATHS.some((pattern) => pattern.test(pathname));
}

// Returns a usable public origin, or '' when the value is missing, malformed, or local in a production build.
export function normalizeSiteOrigin(value, { production = false } = {}) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (production && LOCAL_HOSTS.has(url.hostname)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function siteOrigin() {
  const env = import.meta.env || {};
  return normalizeSiteOrigin(env.VITE_APP_ORIGIN, { production: Boolean(env.PROD) });
}

export function absoluteUrl(path, origin = siteOrigin()) {
  if (!origin || !path) return '';
  return new URL(path, origin).href;
}

// Image URLs must be absolute in Open Graph and JSON-LD.
export function absoluteAsset(src, origin = siteOrigin()) {
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) return src;
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (!base) return '';
  try {
    return new URL(src, base).href;
  } catch {
    return '';
  }
}

export function truncate(text, max = 160) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function compact(value) {
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  if (value === '' || value === null || value === undefined) return undefined;
  return value;
}

export function storeJsonLd(business, { url = '', image = '' } = {}) {
  if (!business?.name) return null;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Store',
    name: business.name,
    description: business.description,
    url,
    image,
    telephone: business.phone,
    email: business.email,
    address: business.city ? { '@type': 'PostalAddress', addressLocality: business.city } : undefined,
    currenciesAccepted: business.currency,
  });
}

export function productJsonLd(product, business, { url = '', images = [] } = {}) {
  if (!product?.name) return null;
  const price = Number(product.price);
  const offer = Number.isFinite(price) && business?.currency
    ? {
        '@type': 'Offer',
        price: price.toFixed(2),
        priceCurrency: business.currency,
        availability: product.available
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        url,
        seller: business?.name ? { '@type': 'Organization', name: business.name } : undefined,
      }
    : undefined;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: images,
    category: product.category,
    offers: offer,
  });
}

export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function setMeta(attr, key, content) {
  let tag = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

function setJsonLd(data) {
  let script = document.getElementById(JSON_LD_ID);
  if (!data) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = JSON_LD_ID;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = serializeJsonLd(data);
}

export function applySeo({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  robots = 'index, follow',
  canonical = '',
  image = '',
  imageAlt = '',
  type = 'website',
  siteName = SITE_NAME,
  jsonLd = null,
} = {}) {
  if (typeof document === 'undefined') return;
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', robots);
  setCanonical(canonical);

  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', type);
  setMeta('property', 'og:site_name', siteName);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:image', image);
  setMeta('property', 'og:image:alt', image ? imageAlt : '');

  setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);

  setJsonLd(jsonLd);
}

export function applyPrivateSeo(title = PRIVATE_TITLE) {
  applySeo({ title, description: DEFAULT_DESCRIPTION, robots: 'noindex, nofollow' });
}

export function useSeo(config) {
  const key = config ? JSON.stringify(config) : '';
  useEffect(() => {
    if (config) applySeo(config);
  }, [key]);
}
