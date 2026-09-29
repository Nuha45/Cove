const STORAGE_PREFIX = 'cove-onboarding:';
const memoryStore = new Map();

export const ONBOARDING_STEPS = 5;

function storageKey(businessId) {
  return `${STORAGE_PREFIX}${businessId || 'unknown'}`;
}

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  // In-memory fallback for Node tests (UI-only; never security-sensitive).
  return {
    getItem(key) {
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    },
    setItem(key, value) {
      memoryStore.set(key, String(value));
    },
    removeItem(key) {
      memoryStore.delete(key);
    },
  };
}

function readRaw(businessId) {
  try {
    const raw = getStorage().getItem(storageKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeRaw(businessId, value) {
  try {
    getStorage().setItem(storageKey(businessId), JSON.stringify(value));
  } catch {
    // Ignore quota / private mode failures — onboarding is UI-only.
  }
}

export function getOnboardingState(businessId) {
  const saved = readRaw(businessId);
  return {
    completed: Boolean(saved?.completed),
    dismissed: Boolean(saved?.dismissed),
    step: Math.min(Math.max(Number(saved?.step) || 0, 0), ONBOARDING_STEPS - 1),
  };
}

export function saveOnboardingState(businessId, patch) {
  const current = getOnboardingState(businessId);
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeRaw(businessId, next);
  return next;
}

export function markOnboardingFinished(businessId, reason = 'completed') {
  return saveOnboardingState(businessId, {
    completed: reason === 'completed',
    dismissed: reason === 'dismissed',
    step: ONBOARDING_STEPS - 1,
  });
}

export function resetOnboarding(businessId) {
  writeRaw(businessId, {
    completed: false,
    dismissed: false,
    step: 0,
    updatedAt: new Date().toISOString(),
  });
  return getOnboardingState(businessId);
}

/** Auto-open only for shops that have not finished and still look new. */
export function shouldAutoOpenOnboarding(businessId, { activeProductCount = 0 } = {}) {
  if (!businessId) return false;
  const state = getOnboardingState(businessId);
  if (state.completed || state.dismissed) return false;
  return Number(activeProductCount) === 0;
}

export function isShopSetupComplete(business) {
  if (!business?.name) return false;
  const hasStory = Boolean(String(business.description || '').trim());
  const hasContact = Boolean(String(business.phone || '').trim() || String(business.city || '').trim());
  const hasLogo = Boolean(business.logo);
  const hasFulfillment = business.pickupEnabled !== false || business.deliveryEnabled !== false;
  return hasFulfillment && (hasStory || hasContact || hasLogo);
}

export function isStorefrontCustomized(business) {
  const theme = business?.storefrontTheme || business?.appearance?.theme || 'warm';
  const accent = String(business?.storefrontAccent || business?.appearance?.accent || '#FF7A3D').toLowerCase();
  const cover = business?.storefrontCoverImage || business?.appearance?.coverImage || '';
  const background = business?.storefrontBackground || business?.appearance?.background || '';
  return theme !== 'warm' || accent !== '#ff7a3d' || Boolean(cover) || Boolean(background);
}

export function isPaymentSetupComplete(business) {
  if (!business) return false;
  const hasUpi = Boolean(String(business.paymentUpiId || '').trim());
  const hasQr = Boolean(business.paymentQrImage);
  if (business.paymentQrEnabled && (hasUpi || hasQr)) return true;
  if (business.paymentLinkEnabled && String(business.paymentLink || '').trim()) return true;
  if (business.paymentInstructionsEnabled && String(business.paymentInstructions || '').trim()) return true;
  return false;
}

export function isStorefrontLive(business) {
  return Boolean(business?.slug) && business?.storefrontActive !== false;
}

export function buildGettingStartedItems({ business, activeProductCount = 0 }) {
  return [
    {
      id: 'shop',
      label: 'Create your shop',
      done: Boolean(business?.name && business?.slug),
      to: '/settings?tab=profile',
    },
    {
      id: 'customize',
      label: 'Customize your storefront',
      done: isStorefrontCustomized(business),
      to: '/storefront#customize',
    },
    {
      id: 'products',
      label: 'Add your first product',
      done: Number(activeProductCount) > 0,
      to: '/products',
    },
    {
      id: 'payments',
      label: 'Set up payments',
      done: isPaymentSetupComplete(business),
      to: '/settings?tab=payments',
    },
    {
      id: 'share',
      label: 'Share your storefront',
      done: isStorefrontLive(business),
      to: '/storefront',
    },
  ];
}

export function gettingStartedProgress(items) {
  const list = Array.isArray(items) ? items : [];
  const done = list.filter((item) => item.done).length;
  return { done, total: list.length, complete: list.length > 0 && done === list.length };
}
