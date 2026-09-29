// Server-authoritative Cove pricing. Never accept amount/plan from the client.

// Internal keys stay 'pro' / 'advanced'; customers see "Cove Basic" / "Cove Plus".

// Every new shop gets exactly this many days of Cove Plus, free, once.
const TRIAL_DAYS = 7;

const COVE_PRO = {
  key: 'pro',
  name: 'Cove Basic',
  amountPaise: 59900,
  amountDisplay: 599,
  currency: 'INR',
  interval: 'monthly',
};

const COVE_ADVANCED = {
  key: 'advanced',
  name: 'Cove Plus',
  amountPaise: 89900,
  amountDisplay: 899,
  currency: 'INR',
  interval: 'monthly',
};

const PLANS = {
  pro: COVE_PRO,
  advanced: COVE_ADVANCED,
};

const PLAN_KEYS = Object.keys(PLANS);

function getPlan(key) {
  return PLANS[key] || COVE_PRO;
}

module.exports = {
  TRIAL_DAYS,
  COVE_PRO,
  COVE_ADVANCED,
  PLANS,
  PLAN_KEYS,
  getPlan,
};
