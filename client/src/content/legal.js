// Legal and business identity used by every legal page. Edit values here only.
// Bracketed values are unresolved business or legal decisions; pages highlight them until replaced.
export const LEGAL = {
  LEGAL_BUSINESS_NAME: '[LEGAL BUSINESS NAME]',
  SUPPORT_EMAIL: '[SUPPORT EMAIL]',
  SUPPORT_PHONE: '[SUPPORT PHONE]',
  REGISTERED_ADDRESS: '[REGISTERED ADDRESS]',
  GOVERNING_LAW: '[GOVERNING LAW]',
  GOVERNING_JURISDICTION: '[GOVERNING JURISDICTION]',
  EFFECTIVE_DATE: '[YYYY-MM-DD]',
  GST_PRICING_STATEMENT: '[STATE WHETHER PRICES INCLUDE OR EXCLUDE GST]',
  REFUND_REQUEST_WINDOW: '[NUMBER OF DAYS]',
  REFUND_PROCESSING_TIME: '[REFUND PROCESSING TIME]',
  GRIEVANCE_OFFICER_NAME: '[GRIEVANCE OFFICER NAME]',
  GRIEVANCE_OFFICER_DESIGNATION: '[GRIEVANCE OFFICER DESIGNATION]',
  GRIEVANCE_OFFICER_EMAIL: '[GRIEVANCE OFFICER EMAIL]',
  GRIEVANCE_RESPONSE_TIMELINE: '[GRIEVANCE RESPONSE TIMELINE]',
};

export const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms of Service' },
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund & Cancellation' },
];

export function isPlaceholder(value) {
  return /^\[.*\]$/.test(String(value));
}
