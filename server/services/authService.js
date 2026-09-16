const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Business = require('../models/Business');
const ApiError = require('../utils/ApiError');
const { uniqueSlug } = require('../utils/slugify');
const { signToken, verifyToken } = require('./tokenService');

const BCRYPT_ROUNDS = 12;
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
      businessId,
    });
    const token = signToken(user);
    return { user, business, token };
  } catch (err) {
    await Business.deleteOne({ _id: businessId });
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

module.exports = { register, login, getProfile, revokeToken };
