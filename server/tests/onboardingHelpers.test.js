const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

describe('seller onboarding helpers', () => {
  let onboarding;

  before(async () => {
    const fileUrl = pathToFileURL(
      path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'onboarding.js')
    ).href;
    onboarding = await import(fileUrl);
  });

  it('does not auto-open after dismiss or complete', () => {
    const businessId = `test-${Date.now()}`;
    assert.equal(onboarding.shouldAutoOpenOnboarding(businessId, { activeProductCount: 0 }), true);
    onboarding.markOnboardingFinished(businessId, 'dismissed');
    assert.equal(onboarding.shouldAutoOpenOnboarding(businessId, { activeProductCount: 0 }), false);
    onboarding.resetOnboarding(businessId);
    onboarding.markOnboardingFinished(businessId, 'completed');
    assert.equal(onboarding.shouldAutoOpenOnboarding(businessId, { activeProductCount: 0 }), false);
  });

  it('skips auto-open when the shop already has products', () => {
    const businessId = `test-products-${Date.now()}`;
    assert.equal(onboarding.shouldAutoOpenOnboarding(businessId, { activeProductCount: 2 }), false);
  });

  it('resumes step from saved state', () => {
    const businessId = `test-step-${Date.now()}`;
    onboarding.saveOnboardingState(businessId, { step: 3 });
    assert.equal(onboarding.getOnboardingState(businessId).step, 3);
  });

  it('builds checklist from real business and product state', () => {
    const items = onboarding.buildGettingStartedItems({
      business: {
        name: 'Cove Test Shop',
        slug: 'cove-test-shop',
        storefrontActive: true,
        storefrontTheme: 'warm',
        storefrontAccent: '#FF7A3D',
        paymentQrEnabled: true,
        paymentUpiId: 'shop@oksbi',
      },
      activeProductCount: 0,
    });
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    assert.equal(byId.shop.done, true);
    assert.equal(byId.customize.done, false);
    assert.equal(byId.products.done, false);
    assert.equal(byId.payments.done, true);
    assert.equal(byId.share.done, true);
    assert.equal(byId.payments.to, '/settings?tab=payments');
    assert.equal(onboarding.gettingStartedProgress(items).done, 3);
  });

  it('manual restart is not blocked by existing products', () => {
    const businessId = `test-restart-${Date.now()}`;
    onboarding.markOnboardingFinished(businessId, 'completed');
    assert.equal(onboarding.shouldAutoOpenOnboarding(businessId, { activeProductCount: 5 }), false);
    onboarding.resetOnboarding(businessId);
    const state = onboarding.getOnboardingState(businessId);
    assert.equal(state.completed, false);
    assert.equal(state.dismissed, false);
    assert.equal(state.step, 0);
  });

  it('marks payments incomplete without a configured customer payment method', () => {
    assert.equal(onboarding.isPaymentSetupComplete({ payOnPickupEnabled: true }), false);
    assert.equal(
      onboarding.isPaymentSetupComplete({
        paymentLinkEnabled: true,
        paymentLink: 'https://pay.example/cove',
      }),
      true
    );
  });
});
