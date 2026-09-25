const CONTENT_TYPES = [
  'Instagram Caption',
  'WhatsApp Promotion',
  'Short Product Description',
];

const TONES = ['Friendly', 'Professional', 'Casual'];

function buildPrompt({ product, contentType, tone }) {
  const price = Number(product.price);
  const priceLabel = Number.isFinite(price) ? `₹${price}` : 'unlisted';
  const description = product.description?.trim() || 'No description provided.';
  const category = product.category?.trim() || 'General';

  return {
    system: [
      'You write short marketing copy for small Indian businesses using Cove.',
      'Return only the marketing text. No title, no markdown fences, no explanation.',
      'Do not invent discounts, delivery promises, or private customer details.',
      'Keep the copy natural and ready to paste.',
    ].join(' '),
    user: [
      `Content type: ${contentType}`,
      `Tone: ${tone}`,
      `Product name: ${product.name}`,
      `Category: ${category}`,
      `Price: ${priceLabel}`,
      `Description: ${description}`,
      '',
      contentType === 'Instagram Caption'
        ? 'Write one Instagram caption with a short hook and a light call to action. Include 3–6 relevant hashtags at the end.'
        : contentType === 'WhatsApp Promotion'
          ? 'Write a short WhatsApp promotion message a seller can send to customers. Keep it under 80 words.'
          : 'Write a short product description suitable for a product page. Keep it under 60 words.',
    ].join('\n'),
  };
}

/** Realistic local sample copy — never calls OpenAI. */
function buildMockContent({ product, contentType, tone }) {
  const name = String(product.name || 'this piece').trim();
  const category = String(product.category || 'General').trim() || 'General';
  const description = String(product.description || '').trim();
  const price = Number(product.price);
  const priceLabel = Number.isFinite(price) ? `₹${price}` : '';
  const detail = description
    ? description.replace(/\s+/g, ' ').slice(0, 120)
    : `a carefully chosen pick from our ${category.toLowerCase()} collection`;

  const toneLead = {
    Friendly: 'Hey!',
    Professional: 'Hello,',
    Casual: 'Hi there —',
  }[tone] || 'Hello,';

  if (contentType === 'Instagram Caption') {
    const hook = {
      Friendly: `Meet ${name} — made to turn everyday moments into something special.`,
      Professional: `Introducing ${name}: a refined addition to our ${category} range.`,
      Casual: `${name} just dropped, and it is an easy yes.`,
    }[tone] || `Introducing ${name}.`;

    return [
      hook,
      '',
      `${detail}${priceLabel ? ` · ${priceLabel}` : ''}.`,
      '',
      'Message us to order or visit the shop link in bio.',
      '',
      `#${category.replace(/[^a-zA-Z0-9]+/g, '') || 'Shop'} #${name.replace(/[^a-zA-Z0-9]+/g, '') || 'Product'} #SmallBusiness #Handmade #CoveShop`,
    ].join('\n');
  }

  if (contentType === 'WhatsApp Promotion') {
    return [
      `${toneLead} quick update from the shop.`,
      '',
      `${name} is available now${priceLabel ? ` for ${priceLabel}` : ''}.`,
      detail.endsWith('.') ? detail : `${detail}.`,
      '',
      'Reply here if you would like to order or ask a question.',
    ].join('\n');
  }

  const opener = {
    Friendly: `${name} is a lovely pick for anyone who loves ${category.toLowerCase()}.`,
    Professional: `${name} is a thoughtfully designed piece from our ${category} collection.`,
    Casual: `${name} keeps things simple and looks great day to day.`,
  }[tone] || `${name} is part of our ${category} collection.`;

  return [
    opener,
    detail.endsWith('.') ? detail : `${detail}.`,
    priceLabel ? `Priced at ${priceLabel}.` : '',
  ].filter(Boolean).join(' ');
}

module.exports = {
  CONTENT_TYPES,
  TONES,
  buildPrompt,
  buildMockContent,
};
