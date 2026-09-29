// Warm, Minimal and Editorial are available on every plan. Modern ("Atelier") and Bold ("Luxe") are Cove Plus only.
const BASIC_STOREFRONT_THEMES = ['warm', 'minimal', 'editorial'];
const PLUS_STOREFRONT_THEMES = ['modern', 'bold'];
const STOREFRONT_THEMES = [...BASIC_STOREFRONT_THEMES, ...PLUS_STOREFRONT_THEMES];
const DEFAULT_STOREFRONT_THEME = 'warm';

// Accent / button colors available on every plan.
const STOREFRONT_ACCENTS = [
  { id: 'cove', value: '#FF7A3D', label: 'Cove orange' },
  { id: 'ocean', value: '#0E7490', label: 'Ocean' },
  { id: 'forest', value: '#3F6F5B', label: 'Forest' },
  { id: 'slate', value: '#476b9b', label: 'Slate blue' },
  { id: 'cocoa', value: '#8B5A2B', label: 'Cocoa' },
  { id: 'rose', value: '#b6504a', label: 'Rose' },
];

// Extra Cove Plus accent / button colors. All keep white button text readable.
const PLUS_STOREFRONT_ACCENTS = [
  { id: 'ink', value: '#1F2937', label: 'Ink' },
  { id: 'plum', value: '#7A3E6D', label: 'Plum' },
  { id: 'violet', value: '#6A4BD8', label: 'Violet' },
  { id: 'gold', value: '#B7791F', label: 'Gold' },
  { id: 'berry', value: '#A8325E', label: 'Berry' },
  { id: 'olive', value: '#5E6B2E', label: 'Olive' },
];

// Cove Plus page backgrounds. Empty value means the theme's own background.
const STOREFRONT_BACKGROUNDS = [
  { id: 'ivory', value: '#FFFBF4', label: 'Ivory' },
  { id: 'sand', value: '#F5EDE3', label: 'Sand' },
  { id: 'blush', value: '#FBEEEE', label: 'Blush' },
  { id: 'sage', value: '#EDF2EC', label: 'Sage' },
  { id: 'mist', value: '#EEF2F7', label: 'Mist' },
  { id: 'stone', value: '#F1F0EE', label: 'Stone' },
];

const DEFAULT_STOREFRONT_ACCENT = '#FF7A3D';
const DEFAULT_COVER_FOCUS = 50;

function presetValue(list, value) {
  const hex = String(value || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return '';
  return list.find((item) => item.value.toLowerCase() === hex)?.value || '';
}

function normalizeTheme(value) {
  const theme = String(value || '').trim().toLowerCase();
  return STOREFRONT_THEMES.includes(theme) ? theme : DEFAULT_STOREFRONT_THEME;
}

function normalizeAccent(value) {
  return presetValue([...STOREFRONT_ACCENTS, ...PLUS_STOREFRONT_ACCENTS], value) || DEFAULT_STOREFRONT_ACCENT;
}

function normalizeBackground(value) {
  return presetValue(STOREFRONT_BACKGROUNDS, value);
}

function isValidAccent(value) {
  return Boolean(presetValue([...STOREFRONT_ACCENTS, ...PLUS_STOREFRONT_ACCENTS], value));
}

function isValidBackground(value) {
  return value === '' || Boolean(presetValue(STOREFRONT_BACKGROUNDS, value));
}

function isPlusTheme(theme) {
  return PLUS_STOREFRONT_THEMES.includes(theme);
}

function isPlusAccent(accent) {
  return Boolean(presetValue(PLUS_STOREFRONT_ACCENTS, accent));
}

/** Focal point inside the banner frame (0 = left/top, 100 = right/bottom). */
function normalizeCoverFocus(value, fallback = DEFAULT_COVER_FOCUS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Appearance sent to a browser. Without `plus`, saved Cove Plus choices are kept in the
 * database but replaced by the Basic defaults, so a shop that loses Cove Plus falls back
 * to a Basic look and gets its saved look back when Cove Plus returns.
 */
function publicAppearance(doc, { plus = false } = {}) {
  const theme = normalizeTheme(doc.storefrontTheme);
  const accent = normalizeAccent(doc.storefrontAccent);
  return {
    theme: plus || !isPlusTheme(theme) ? theme : DEFAULT_STOREFRONT_THEME,
    accent: plus || !isPlusAccent(accent) ? accent : DEFAULT_STOREFRONT_ACCENT,
    background: plus ? normalizeBackground(doc.storefrontBackground) : '',
    coverImage: doc.storefrontCoverImage || '',
    coverFocusX: normalizeCoverFocus(doc.storefrontCoverFocusX),
    coverFocusY: normalizeCoverFocus(doc.storefrontCoverFocusY),
  };
}

module.exports = {
  STOREFRONT_THEMES,
  BASIC_STOREFRONT_THEMES,
  PLUS_STOREFRONT_THEMES,
  DEFAULT_STOREFRONT_THEME,
  STOREFRONT_ACCENTS,
  PLUS_STOREFRONT_ACCENTS,
  STOREFRONT_BACKGROUNDS,
  DEFAULT_STOREFRONT_ACCENT,
  DEFAULT_COVER_FOCUS,
  normalizeTheme,
  normalizeAccent,
  normalizeBackground,
  isValidAccent,
  isValidBackground,
  isPlusTheme,
  isPlusAccent,
  normalizeCoverFocus,
  publicAppearance,
};
