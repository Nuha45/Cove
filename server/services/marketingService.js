const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { buildPrompt, buildMockContent } = require('../utils/marketingContent');
const aiProvider = require('./aiProvider');
const env = require('../config/env');

async function getStatus() {
  const mockMode = Boolean(env.ai.mockMode);
  return {
    configured: mockMode || aiProvider.isConfigured(),
    mockMode,
    provider: mockMode ? 'mock' : env.ai.provider,
  };
}

async function generate(businessId, { productId, contentType, tone }) {
  const product = await Product.findOne({
    _id: productId,
    businessId,
    status: 'Active',
  }).select('name description price category status');

  if (!product) {
    throw new ApiError(404, 'We could not find that product in your catalog.');
  }

  const productPayload = {
    name: product.name,
    description: product.description,
    price: product.price,
    category: product.category,
  };

  let content;
  if (env.ai.mockMode) {
    content = buildMockContent({
      product: productPayload,
      contentType,
      tone,
    });
  } else {
    const prompt = buildPrompt({
      product: productPayload,
      contentType,
      tone,
    });
    content = await aiProvider.generateText(prompt);
  }

  return {
    content,
    contentType,
    tone,
    mockMode: Boolean(env.ai.mockMode),
    product: {
      id: product._id.toString(),
      name: product.name,
      description: product.description || '',
      price: product.price,
      category: product.category || '',
    },
  };
}

module.exports = {
  getStatus,
  generate,
};
