const STOREFRONT_THEMES = ['warm', 'minimal', 'editorial'];
const DEFAULT_STOREFRONT_THEME = 'warm';

const STOREFRONT_ACCENTS = [
  { id: 'cove', value: '#FF7A3D', label: 'Cove orange' },
  { id: 'ember', value: '#E8652A', label: 'Ember' },
  { id: 'forest', value: '#3F6F5B', label: 'Forest' },
  { id: 'slate', value: '#476b9b', label: 'Slate blue' },
  { id: 'cocoa', value: '#8B5A2B', label: 'Cocoa' },
  { id: 'rose', value: '#b6504a', label: 'Rose' },
];

const DEFAULT_STOREFRONT_ACCENT = '#FF7A3D';
const ACCENT_VALUES = new Set(STOREFRONT_ACCENTS.map((item) => item.value.toLowerCase()));

function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase();
  return STOREFRONT_THEMES.includes(theme) ? theme : DEFAULT_STOREFRONT_THEME;
}

function normalizeAccent(value) {
  const hex = String(value || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(hex) && ACCENT_VALUES.has(hex.toLowerCase())) {
    return STOREFRONT_ACCENTS.find((item) => item.value.toLowerCase() === hex.toLowerCase()).value;
  }
  return DEFAULT_STOREFRONT_ACCENT;
}

function publicAppearance(doc) {
  return {
    theme: normalizeTheme(doc.storefrontTheme),
    accent: normalizeAccent(doc.storefrontAccent),
    coverImage: doc.storefrontCoverImage || '',
  };
}

module.exports = {
  STOREFRONT_THEMES,
  DEFAULT_STOREFRONT_THEME,
  STOREFRONT_ACCENTS,
  DEFAULT_STOREFRONT_ACCENT,
  normalizeTheme,
  normalizeAccent,
  publicAppearance,
};
