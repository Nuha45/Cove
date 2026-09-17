// Server-authoritative Cove Pro pricing. Never accept amount/plan from the client.
const COVE_PRO = {
  name: 'Cove Pro',
  amountPaise: 59900,
  amountDisplay: 599,
  currency: 'INR',
  interval: 'monthly',
  trialDays: 30,
};

module.exports = { COVE_PRO };
