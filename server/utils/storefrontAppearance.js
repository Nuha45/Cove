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
const DEFAULT_COVER_FOCUS = 50;
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

/** Focal point inside the banner frame (0 = left/top, 100 = right/bottom). */
function normalizeCoverFocus(value, fallback = DEFAULT_COVER_FOCUS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function publicAppearance(doc) {
  return {
    theme: normalizeTheme(doc.storefrontTheme),
    accent: normalizeAccent(doc.storefrontAccent),
    coverImage: doc.storefrontCoverImage || '',
    coverFocusX: normalizeCoverFocus(doc.storefrontCoverFocusX),
    coverFocusY: normalizeCoverFocus(doc.storefrontCoverFocusY),
  };
}

module.exports = {
  STOREFRONT_THEMES,
  DEFAULT_STOREFRONT_THEME,
  STOREFRONT_ACCENTS,
  DEFAULT_STOREFRONT_ACCENT,
  DEFAULT_COVER_FOCUS,
  normalizeTheme,
  normalizeAccent,
  normalizeCoverFocus,
  publicAppearance,
};
