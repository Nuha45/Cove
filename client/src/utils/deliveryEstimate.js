export const DELIVERY_ESTIMATE_OPTIONS = [
  { value: 'same_day', label: 'Same day' },
  { value: '1_2_days', label: '1–2 days' },
  { value: '2_3_days', label: '2–3 days' },
  { value: '3_5_days', label: '3–5 days' },
  { value: '5_7_days', label: '5–7 days' },
  { value: 'custom', label: 'Custom message' },
];

export const DELIVERY_ESTIMATE_NOTE_MAX = 160;
export const ESTIMATE_DISCLAIMER = 'This is an estimate from the shop, not a guarantee.';

// Mirrors the server: the text shoppers would see for the current settings, or null.
export function previewDeliveryEstimate({ deliveryEstimate, deliveryEstimateNote }) {
  const note = String(deliveryEstimateNote || '').replace(/\s+/g, ' ').trim();
  if (deliveryEstimate === 'custom') return note ? { text: note, note: '' } : null;
  const option = DELIVERY_ESTIMATE_OPTIONS.find((item) => item.value === deliveryEstimate);
  return option ? { text: option.label, note } : null;
}
