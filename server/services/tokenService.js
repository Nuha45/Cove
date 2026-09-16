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
  return jwt.verify(token, env.jwtSecret);
}

function cookieOptions() {
  const secure = env.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
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
