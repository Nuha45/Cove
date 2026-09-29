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
  {
    id: 'modern',
    label: 'Atelier',
    blurb: 'Airy and soft — a gently glowing hero with floating product cards.',
    plus: true,
  },
  {
    id: 'bold',
    label: 'Luxe',
    blurb: 'Quietly refined — a framed hero with your monogram and fine serif type.',
    plus: true,
  },
];

export const STOREFRONT_ACCENTS = [
  { id: 'cove', value: '#FF7A3D', label: 'Cove orange' },
  { id: 'ocean', value: '#0E7490', label: 'Ocean' },
  { id: 'forest', value: '#3F6F5B', label: 'Forest' },
  { id: 'slate', value: '#476b9b', label: 'Slate blue' },
  { id: 'cocoa', value: '#8B5A2B', label: 'Cocoa' },
  { id: 'rose', value: '#b6504a', label: 'Rose' },
];

// Must match server/utils/storefrontAppearance.js. The server is the source of truth.
export const PLUS_STOREFRONT_ACCENTS = [
  { id: 'ink', value: '#1F2937', label: 'Ink' },
  { id: 'plum', value: '#7A3E6D', label: 'Plum' },
  { id: 'violet', value: '#6A4BD8', label: 'Violet' },
  { id: 'gold', value: '#B7791F', label: 'Gold' },
  { id: 'berry', value: '#A8325E', label: 'Berry' },
  { id: 'olive', value: '#5E6B2E', label: 'Olive' },
];

export const STOREFRONT_BACKGROUNDS = [
  { id: 'ivory', value: '#FFFBF4', label: 'Ivory' },
  { id: 'sand', value: '#F5EDE3', label: 'Sand' },
  { id: 'blush', value: '#FBEEEE', label: 'Blush' },
  { id: 'sage', value: '#EDF2EC', label: 'Sage' },
  { id: 'mist', value: '#EEF2F7', label: 'Mist' },
  { id: 'stone', value: '#F1F0EE', label: 'Stone' },
];

export const DEFAULT_COVER_FOCUS = 50;

export const DEFAULT_APPEARANCE = {
  theme: 'warm',
  accent: '#FF7A3D',
  background: '',
  coverImage: '',
  coverFocusX: DEFAULT_COVER_FOCUS,
  coverFocusY: DEFAULT_COVER_FOCUS,
};

function presetValue(list, value) {
  const hex = String(value || '').trim().toLowerCase();
  return list.find((item) => item.value.toLowerCase() === hex)?.value || '';
}

export function isPlusTheme(theme) {
  return STOREFRONT_THEMES.some((item) => item.id === theme && item.plus);
}

export function isPlusAccent(accent) {
  return Boolean(presetValue(PLUS_STOREFRONT_ACCENTS, accent));
}

export function hasPlusAppearance(appearance = {}) {
  return isPlusTheme(appearance.theme) || isPlusAccent(appearance.accent) || Boolean(appearance.background);
}

export function normalizeCoverFocus(value, fallback = DEFAULT_COVER_FOCUS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function coverObjectPosition(appearance = {}) {
  const x = normalizeCoverFocus(appearance.coverFocusX);
  const y = normalizeCoverFocus(appearance.coverFocusY);
  return `${x}% ${y}%`;
}

export function normalizeAppearance(input = {}) {
  const themeIds = STOREFRONT_THEMES.map((item) => item.id);
  const theme = themeIds.includes(input.theme) ? input.theme : DEFAULT_APPEARANCE.theme;
  const accent = presetValue([...STOREFRONT_ACCENTS, ...PLUS_STOREFRONT_ACCENTS], input.accent)
    || DEFAULT_APPEARANCE.accent;

  return {
    theme,
    accent,
    background: presetValue(STOREFRONT_BACKGROUNDS, input.background),
    coverImage: typeof input.coverImage === 'string' ? input.coverImage : '',
    coverFocusX: normalizeCoverFocus(input.coverFocusX),
    coverFocusY: normalizeCoverFocus(input.coverFocusY),
  };
}

export function appearanceFromBusiness(business) {
  return normalizeAppearance({
    theme: business?.storefrontTheme || business?.appearance?.theme,
    accent: business?.storefrontAccent || business?.appearance?.accent,
    background: business?.storefrontBackground ?? business?.appearance?.background,
    coverImage: business?.storefrontCoverImage || business?.appearance?.coverImage || '',
    coverFocusX: business?.storefrontCoverFocusX ?? business?.appearance?.coverFocusX,
    coverFocusY: business?.storefrontCoverFocusY ?? business?.appearance?.coverFocusY,
  });
}

// Mirrors the server fallback: without Cove Plus, Plus-only choices show as the Basic defaults.
export function effectiveAppearance(appearance, plus) {
  if (plus) return appearance;
  return {
    ...appearance,
    theme: isPlusTheme(appearance.theme) ? DEFAULT_APPEARANCE.theme : appearance.theme,
    accent: isPlusAccent(appearance.accent) ? DEFAULT_APPEARANCE.accent : appearance.accent,
    background: '',
  };
}

// Props for the storefront root (public store and dashboard preview).
export function storeThemeProps(appearance) {
  return {
    'data-theme': appearance.theme,
    'data-bg': appearance.background ? 'custom' : undefined,
    style: {
      '--store-accent': appearance.accent,
      ...(appearance.background ? { '--store-bg': appearance.background } : {}),
    },
  };
}
