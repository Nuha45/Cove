const jwt = require('jsonwebtoken');
const env = require('../config/env');

const COOKIE_NAME = 'cove_token';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      businessId: String(user.businessId),
      tv: user.tokenVersion,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function verifyToken(token) {
  // Pin the algorithm: the secret is an HMAC key, so only HS256 tokens can be genuine.
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

function cookieOptions() {
  // Browsers reject SameSite=None cookies that are not Secure.
  const secure = env.isProduction || env.cookieSameSite === 'none';
  return {
    httpOnly: true,
    secure,
    sameSite: env.cookieSameSite,
    path: '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    ...cookieOptions(),
    maxAge: env.jwtMaxAgeMs,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

module.exports = {
  COOKIE_NAME,
  signToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
};
