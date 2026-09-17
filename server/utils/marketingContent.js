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

module.exports = {
  CONTENT_TYPES,
  TONES,
  buildPrompt,
};
