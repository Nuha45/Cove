const env = require('../config/env');
const ApiError = require('../utils/ApiError');

let generateImpl;

async function defaultGenerate({ system, user }) {
  if (!env.ai.apiKey) {
    throw new ApiError(
      503,
      'AI marketing is not configured yet. Add an OpenAI API key on the server to generate content.'
    );
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: env.ai.model,
      temperature: 0.7,
      max_tokens: 350,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(502, 'The AI service could not generate content right now. Please try again.');
  }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    throw new ApiError(502, 'The AI service returned an empty response. Please try again.');
  }

  return String(text).trim();
}

async function generateText(input) {
  const runner = generateImpl || defaultGenerate;
  return runner(input);
}

function setGenerateForTests(fn) {
  generateImpl = fn;
}

function resetGenerateForTests() {
  generateImpl = undefined;
}

function isConfigured() {
  return Boolean(env.ai.apiKey);
}

module.exports = {
  generateText,
  setGenerateForTests,
  resetGenerateForTests,
  isConfigured,
};
