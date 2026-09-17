export const BILLING_STATUS_LABEL = {
  incomplete: 'Payment required',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  halted: 'Halted',
  cancelled: 'Cancelled',
};

export const BILLING_STATUS_TONE = {
  incomplete: 'orange',
  trialing: 'blue',
  active: 'green',
  past_due: 'orange',
  halted: 'red',
  cancelled: 'neutral',
};

export function loadRazorpayCheckout() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Checkout is only available in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cove-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.coveRazorpay = 'true';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
}
