const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { setAuthCookie, clearAuthCookie, COOKIE_NAME } = require('../services/tokenService');

function sendSession(res, statusCode, result) {
  setAuthCookie(res, result.token);
  res.status(statusCode).json({
    user: result.user.toPublic(),
    business: result.business.toPublic(),
  });
}

const register = asyncHandler(async (req, res) => {
  const result = await authService.register({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    businessName: req.body.businessName,
    category: req.body.category,
    phone: req.body.phone,
    city: req.body.city,
  });
  sendSession(res, 201, result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
  });
  sendSession(res, 200, result);
});

const logout = asyncHandler(async (req, res) => {
  await authService.revokeToken(req.cookies?.[COOKIE_NAME]);
  clearAuthCookie(res);
  res.json({ message: 'You have been logged out.' });
});

const me = asyncHandler(async (req, res) => {
  const result = await authService.getProfile(req.user);
  res.json({
    user: result.user.toPublic(),
    business: result.business.toPublic(),
  });
});

module.exports = { register, login, logout, me };
