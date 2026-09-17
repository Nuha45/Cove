const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { buildPrompt } = require('../utils/marketingContent');
const aiProvider = require('./aiProvider');
const env = require('../config/env');

async function getStatus() {
  return {
    configured: aiProvider.isConfigured(),
    provider: env.ai.provider,
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

  const prompt = buildPrompt({
    product: {
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
    },
    contentType,
    tone,
  });

  const content = await aiProvider.generateText(prompt);

  return {
    content,
    contentType,
    tone,
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
