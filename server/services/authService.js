const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { uniqueSlug } = require('../utils/slugify');
const { signToken, verifyToken } = require('./tokenService');
const billingService = require('./billingService');
const emailService = require('./emailService');
const env = require('../config/env');

const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 30 * 60 * 1000;
const GENERIC_RESET_MESSAGE = 'If an account exists for this email, a password reset link has been sent.';
let dummyHashPromise;

function dummyPasswordHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('not-a-real-password', BCRYPT_ROUNDS);
  }
  return dummyHashPromise;
}

async function register(input) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const businessId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const slug = await uniqueSlug(input.businessName);

  let business;
  try {
    business = await Business.create({
      _id: businessId,
      ownerId: userId,
      name: input.businessName,
      slug,
      category: input.category,
      phone: input.phone || '',
      city: input.city || '',
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.slug) {
      business = await Business.create({
        _id: businessId,
        ownerId: userId,
        name: input.businessName,
        slug: `${slug}-${businessId.toString().slice(-4)}`,
        category: input.category,
        phone: input.phone || '',
        city: input.city || '',
      });
    } else {
      throw err;
    }
  }

  try {
    const user = await User.create({
      _id: userId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'owner',
      isPlatformAdmin: false,
      businessId,
    });
    // One server-side trial per new business. Never trust client trial dates.
    await billingService.createTrialForBusiness(businessId);
    const token = signToken(user);
    return { user, business, token };
  } catch (err) {
    await Business.deleteOne({ _id: businessId });
    const Subscription = require('../models/Subscription');
    await Subscription.deleteOne({ businessId }).catch(() => {});
    if (err.code === 11000 && err.keyPattern?.email) {
      throw new ApiError(409, 'An account with this email already exists.');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const hash = user?.passwordHash || (await dummyPasswordHash());
  const matches = await bcrypt.compare(password, hash);

  if (!user || !matches) {
    throw new ApiError(401, 'Email or password is incorrect.');
  }

  const business = await Business.findById(user.businessId);
  if (!business) {
    throw new ApiError(401, 'We could not find the business for this account.');
  }

  return { user, business, token: signToken(user) };
}

async function getProfile(user) {
  const business = await Business.findById(user.businessId);
  if (!business) {
    throw new ApiError(404, 'We could not find your business.');
  }
  return { user, business };
}

async function revokeToken(token) {
  if (!token) return;

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return;
  }

  await User.updateOne(
    { _id: payload.sub, tokenVersion: payload.tv },
    { $inc: { tokenVersion: 1 } }
  );
}

async function requestPasswordReset(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalized });

  // Always return the same message. Timing is padded with a dummy hash when unknown.
  if (!user) {
    await dummyPasswordHash();
    return { message: GENERIC_RESET_MESSAGE };
  }

  const rawToken = emailService.createResetToken();
  const tokenHash = emailService.hashResetToken(rawToken);
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TTL_MS);
  await user.save();

  const resetUrl = `${env.appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const sendResult = await emailService.sendPasswordReset({
    to: user.email,
    name: user.name,
    resetUrl,
  });

  if (!sendResult.ok && env.nodeEnv !== 'production') {
    console.error('[auth] password reset email was not delivered', {
      to: user.email,
      error: sendResult.error || 'unknown',
    });
  }

  return { message: GENERIC_RESET_MESSAGE };
}

async function resetPassword({ token, password }) {
  const raw = String(token || '').trim();
  if (!raw || raw.length < 32) {
    throw new ApiError(400, 'Invalid or expired reset link.');
  }

  const tokenHash = emailService.hashResetToken(raw);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +passwordResetTokenHash +passwordResetExpiresAt');

  if (!user) {
    throw new ApiError(400, 'Invalid or expired reset link.');
  }

  user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  return { message: 'Your password has been reset. You can log in with your new password.' };
}

module.exports = {
  register,
  login,
  getProfile,
  revokeToken,
  requestPasswordReset,
  resetPassword,
  GENERIC_RESET_MESSAGE,
};
