export const HELP_CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting started',
    articles: [
      {
        id: 'setup-shop',
        title: 'Set up your shop',
        body: 'Open Settings to add your shop name, logo, description, phone, and city. Turn on pickup and delivery so customers know how they can receive their order.',
        action: { to: '/settings', label: 'Open Settings' },
      },
      {
        id: 'add-product',
        title: 'Add your first product',
        body: 'Go to Products and add what you sell — name, price, photo, and stock. Active products appear on your public storefront right away.',
        action: { to: '/products', label: 'Go to Products' },
      },
      {
        id: 'share-storefront',
        title: 'Share your storefront',
        body: 'Open Storefront to copy your shop link. Put it in your Instagram or WhatsApp bio so customers can browse and order without messaging you for every detail.',
        action: { to: '/storefront', label: 'Open Storefront' },
      },
    ],
  },
  {
    id: 'orders',
    title: 'Orders',
    articles: [
      {
        id: 'how-orders-work',
        title: 'How orders work',
        body: 'When a customer places an order through your storefront, Cove creates it in your Orders page automatically. Open an order to see products, quantities, payment status, and pickup or delivery details. Update the status as you prepare and complete it.',
        action: { to: '/orders', label: 'Go to Orders' },
      },
      {
        id: 'how-customers-order',
        title: 'How customers place orders',
        body: 'Customers open your storefront link, add items to their cart, choose pickup or delivery, and check out. You do not need to create the order yourself unless you want to add one manually.',
        action: { to: '/orders/new', label: 'Add an order manually' },
      },
      {
        id: 'pickup-delivery',
        title: 'Pickup and delivery',
        body: 'In Settings, choose whether you offer pickup, delivery, or both. Delivery can include a fee that Cove adds to the order total for you.',
        action: { to: '/settings', label: 'Open Settings' },
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    articles: [
      {
        id: 'seller-direct',
        title: 'How seller-direct payments work',
        body: 'Customers pay you directly — for example with UPI, a QR code, a payment link, pay on pickup, or cash on delivery. Cove never holds your customer payments. Set your preferred methods in Settings.',
        action: { to: '/settings', label: 'Open Settings' },
      },
      {
        id: 'verify-payment',
        title: 'How to verify a customer payment',
        body: 'When a customer sends payment details, the order shows as payment submitted. Check your UPI or bank app, then mark the payment as paid in the order when you have confirmed it.',
        action: { to: '/orders', label: 'Go to Orders' },
      },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    articles: [
      {
        id: 'customer-records',
        title: 'Customer records',
        body: 'People who order from your storefront appear in Customers automatically. Open a customer to see their contact details and past orders.',
        action: { to: '/customers', label: 'Go to Customers' },
      },
      {
        id: 'customer-wants',
        title: 'Customer Wants',
        body: 'When shoppers request something you do not sell yet, it appears in Customer Wants. You can follow up privately, or approve opted-in requests for your public request board.',
        action: { to: '/customer-wants', label: 'Go to Customer Wants' },
      },
    ],
  },
  {
    id: 'storefront',
    title: 'Storefront',
    articles: [
      {
        id: 'customize',
        title: 'Customize your storefront',
        body: 'On the Storefront page, choose a theme, accent color, and optional cover image. Save to publish the look customers see on your public shop.',
        action: { to: '/storefront', label: 'Open Storefront' },
      },
      {
        id: 'share-link',
        title: 'Share your store link',
        body: 'Your storefront link is unique to your shop. Copy it from Storefront or Settings and share it wherever your customers already find you.',
        action: { to: '/storefront', label: 'Open Storefront' },
      },
    ],
  },
  {
    id: 'business',
    title: 'Business',
    articles: [
      {
        id: 'analytics',
        title: 'Analytics',
        body: 'Analytics shows simple numbers from your real orders, customers, and requests — so you can see how your shop is doing over time.',
        action: { to: '/analytics', label: 'Go to Analytics' },
      },
      {
        id: 'notifications',
        title: 'Notifications',
        body: 'Cove can notify you about new orders, payment updates, and customer requests. Manage email preferences in Settings.',
        action: { to: '/settings', label: 'Open Settings' },
      },
      {
        id: 'billing',
        title: 'Billing',
        body: 'Billing is for your Cove subscription — what you pay Cove to use the product. It is separate from the payments customers send you for their orders.',
        action: { to: '/billing', label: 'Go to Billing' },
      },
    ],
  },
];
