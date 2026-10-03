import { afterEach, describe, expect, it } from 'vitest';
import { applySeo, DEFAULT_TITLE, homeJsonLd } from './seo';

describe('homepage structured data', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('describes Cove as an Organization and a WebSite with only supported details', () => {
    const data = homeJsonLd();
    expect(data['@context']).toBe('https://schema.org');

    const organization = data['@graph'].find((item) => item['@type'] === 'Organization');
    expect(organization).toEqual({
      '@type': 'Organization',
      '@id': 'https://www.mycove.online/#organization',
      name: 'Cove',
      url: 'https://www.mycove.online',
      logo: 'https://www.mycove.online/cove-logo.png',
      description:
        'Cove helps independent sellers manage their products, orders, customers, payments, and online business in one place.',
    });

    const website = data['@graph'].find((item) => item['@type'] === 'WebSite');
    expect(website).toEqual({
      '@type': 'WebSite',
      '@id': 'https://www.mycove.online/#website',
      name: 'Cove',
      url: 'https://www.mycove.online/',
      publisher: { '@id': 'https://www.mycove.online/#organization' },
    });

    const serialized = JSON.stringify(data);
    for (const field of ['address', 'telephone', 'email', 'sameAs', 'aggregateRating', 'review', 'vatID', 'taxID']) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it('adds the JSON-LD alongside the existing title and canonical', () => {
    applySeo({ title: DEFAULT_TITLE, canonical: 'https://www.mycove.online/', jsonLd: homeJsonLd() });

    expect(document.title).toBe(DEFAULT_TITLE);
    expect(document.head.querySelector('link[rel="canonical"]').getAttribute('href')).toBe('https://www.mycove.online/');
    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent)).toEqual(homeJsonLd());
  });
});
