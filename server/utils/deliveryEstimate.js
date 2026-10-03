// Seller-chosen delivery estimate shown to shoppers. Display copy only: Cove does not predict or track delivery.
const DELIVERY_ESTIMATE_OPTIONS = {
  same_day: 'Same day',
  '1_2_days': '1–2 days',
  '2_3_days': '2–3 days',
  '3_5_days': '3–5 days',
  '5_7_days': '5–7 days',
  custom: 'Custom message',
};

const DELIVERY_ESTIMATES = Object.keys(DELIVERY_ESTIMATE_OPTIONS);
const DELIVERY_ESTIMATE_NOTE_MAX = 160;

// Returns { text, note } for a shop's current setting, or null when shoppers should see nothing.
function deliveryEstimateFor(business) {
  if (!business?.deliveryEstimateEnabled || business.deliveryEnabled === false) return null;
  const note = String(business.deliveryEstimateNote || '').trim();
  if (business.deliveryEstimate === 'custom') {
    return note ? { text: note, note: '' } : null;
  }
  const text = DELIVERY_ESTIMATE_OPTIONS[business.deliveryEstimate];
  if (!text) return null;
  return { text, note };
}

function publicOrderEstimate(order) {
  const text = order?.deliveryEstimate?.text;
  if (!text || order.deliveryMethod !== 'Delivery') return null;
  return { text, note: order.deliveryEstimate.note || '' };
}

module.exports = {
  DELIVERY_ESTIMATE_OPTIONS,
  DELIVERY_ESTIMATES,
  DELIVERY_ESTIMATE_NOTE_MAX,
  deliveryEstimateFor,
  publicOrderEstimate,
};
