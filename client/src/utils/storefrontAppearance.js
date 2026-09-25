export const STOREFRONT_THEMES = [
  {
    id: 'warm',
    label: 'Warm',
    blurb: 'Soft peach tones — Cove’s classic boutique look.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    blurb: 'Clean white space with quiet borders.',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    blurb: 'Serif headlines and a more magazine-like feel.',
  },
];

export const STOREFRONT_ACCENTS = [
  { id: 'cove', value: '#FF7A3D', label: 'Cove orange' },
  { id: 'ember', value: '#E8652A', label: 'Ember' },
  { id: 'forest', value: '#3F6F5B', label: 'Forest' },
  { id: 'slate', value: '#476b9b', label: 'Slate blue' },
  { id: 'cocoa', value: '#8B5A2B', label: 'Cocoa' },
  { id: 'rose', value: '#b6504a', label: 'Rose' },
];

export const DEFAULT_APPEARANCE = {
  theme: 'warm',
  accent: '#FF7A3D',
  coverImage: '',
};

export function normalizeAppearance(input = {}) {
  const themeIds = STOREFRONT_THEMES.map((item) => item.id);
  const accentValues = STOREFRONT_ACCENTS.map((item) => item.value.toLowerCase());
  const theme = themeIds.includes(input.theme) ? input.theme : DEFAULT_APPEARANCE.theme;
  const rawAccent = String(input.accent || '').trim();
  const accent = accentValues.includes(rawAccent.toLowerCase())
    ? STOREFRONT_ACCENTS.find((item) => item.value.toLowerCase() === rawAccent.toLowerCase()).value
    : DEFAULT_APPEARANCE.accent;

  return {
    theme,
    accent,
    coverImage: typeof input.coverImage === 'string' ? input.coverImage : '',
  };
}

export function appearanceFromBusiness(business) {
  return normalizeAppearance({
    theme: business?.storefrontTheme || business?.appearance?.theme,
    accent: business?.storefrontAccent || business?.appearance?.accent,
    coverImage: business?.storefrontCoverImage || business?.appearance?.coverImage || '',
  });
}
