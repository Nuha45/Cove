export const BILLING_STATUS_LABEL = {
  incomplete: 'Payment required',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Payment due',
  halted: 'Payment failed',
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

export const PLAN_DETAILS = {
  pro: {
    lead: 'Everything you need to run your shop and take orders.',
    features: [
      'Products, orders, customers, and storefront',
      'Customer requests and want board',
      'Order and payment email alerts',
      'Basic sales analytics',
    ],
  },
  advanced: {
    lead: 'Everything you need to understand your customers, manage your store efficiently and grow your business.',
    features: [
      'Everything in Cove Basic',
      'Detailed store analytics',
      'Customer interaction analytics',
      'Visitor, product view and add-to-cart tracking',
      'PDF invoices and invoice history',
      'Low-stock alerts',
      'Bulk product management',
      'Sales reports with CSV export',
      'Extra email notifications',
      'Weekly seller reports',
      'Storefront announcements and featured products',
      'Advanced storefront customization: premium themes and colors',
    ],
  },
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
