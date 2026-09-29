// Seller, admin, and account areas. Store cart, checkout, confirmation, and request pages are not listed
// so crawlers can still read their noindex tag.
export const PRIVATE_PATHS = [
  '/api/',
  '/admin',
  '/dashboard',
  '/products',
  '/orders',
  '/invoices',
  '/customers',
  '/customer-wants',
  '/analytics',
  '/storefront',
  '/billing',
  '/help',
  '/settings',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

export function validSitemapUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (LOCAL_HOSTS.has(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function buildRobotsTxt({ sitemapUrl = '' } = {}) {
  // The sitemap is served under /api/ on the same site; crawlers skip sitemaps robots.txt blocks.
  const lines = [
    'User-agent: *',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    'Allow: /api/seo/sitemap.xml',
    'Allow: /store/',
  ];
  const sitemap = validSitemapUrl(sitemapUrl);
  if (sitemap) lines.push('', `Sitemap: ${sitemap}`);
  return `${lines.join('\n')}\n`;
}
