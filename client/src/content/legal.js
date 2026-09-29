// Replace every bracketed value before launch. Pages highlight any value still in [brackets].
export const LEGAL = {
  businessName: '[LEGAL BUSINESS NAME]',
  supportEmail: '[SUPPORT EMAIL]',
  address: '[REGISTERED ADDRESS]',
  jurisdiction: '[GOVERNING LAW AND JURISDICTION]',
  effectiveDate: '[EFFECTIVE DATE]',
  taxNote: '[STATE WHETHER PRICES INCLUDE OR EXCLUDE GST]',
  refundRequestDays: '[NUMBER OF DAYS]',
  refundProcessingTime: '[REFUND PROCESSING TIME]',
};

export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund & Cancellation' },
];

export function isPlaceholder(value) {
  return /^\[.*\]$/.test(String(value));
}
