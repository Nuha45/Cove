// Drops MongoDB operator keys ("$gt", "$where", ...) and prototype keys from request input so
// they can never reach a query or be merged into an object. Cove never expects such keys.
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 20;

function clean(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = clean(item, depth + 1);
    });
    return value;
  }
  Object.keys(value).forEach((key) => {
    if (key.startsWith('$') || BLOCKED_KEYS.has(key)) {
      delete value[key];
    } else {
      value[key] = clean(value[key], depth + 1);
    }
  });
  return value;
}

// Every Cove query parameter is a single string. `?search=a&search=b` or `?search[x]=1` would
// otherwise reach services as arrays/objects and break string handling.
function flattenQuery(query) {
  Object.keys(query).forEach((key) => {
    const value = query[key];
    if (Array.isArray(value)) {
      const last = value.filter((item) => typeof item === 'string').pop();
      if (last === undefined) delete query[key];
      else query[key] = last;
    } else if (value && typeof value === 'object') {
      delete query[key];
    }
  });
  return query;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) clean(req.body);
  if (req.query && typeof req.query === 'object') flattenQuery(clean(req.query));
  next();
}

module.exports = { sanitizeInput, clean, flattenQuery };
