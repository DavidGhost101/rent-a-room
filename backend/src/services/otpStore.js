const mongoose = require('mongoose');
const OtpCode = require('../models/OtpCode');

/**
 * Storage for pending OTP codes.
 *
 * Writes go to MongoDB when it is connected, so any server instance can verify a
 * code any other instance issued. The in-memory Map is kept as a mirror and is
 * the sole store when MongoDB is unavailable, matching the resilient fallback
 * pattern the rest of this app uses. Development with no database configured
 * therefore still works exactly as before.
 *
 * Every method is async. Callers must await.
 */
const memory = new Map();

function dbReady() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function toEntry(doc) {
  if (!doc) return null;
  return {
    otp: doc.otp,
    createdAt: doc.createdAt,
    cooldownExpiresAt: doc.cooldownExpiresAt,
    expiresAt: doc.expiresAt,
    attempts: doc.attempts,
    maxAttempts: doc.maxAttempts,
    phone: doc.phone
  };
}

module.exports = {
  async get(key) {
    if (!key) return null;
    if (dbReady()) {
      try {
        const doc = await OtpCode.findOne({ phone: key }).lean();
        if (doc) return toEntry(doc);
      } catch (err) {
        console.warn('OTP store read notice:', err.message);
      }
    }
    return memory.get(key) || null;
  },

  async set(key, entry) {
    if (!key) return;
    memory.set(key, entry);
    if (dbReady()) {
      try {
        await OtpCode.findOneAndUpdate(
          { phone: key },
          { ...entry, phone: key, expireAt: new Date(entry.expiresAt) },
          { upsert: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.warn('OTP store write notice:', err.message);
      }
    }
  },

  async delete(key) {
    if (!key) return;
    memory.delete(key);
    if (dbReady()) {
      try {
        await OtpCode.deleteOne({ phone: key });
      } catch (err) {
        console.warn('OTP store delete notice:', err.message);
      }
    }
  },

  /** Persist an incremented attempt count so retries are counted across instances. */
  async setAttempts(key, attempts) {
    if (!key) return;
    const cached = memory.get(key);
    if (cached) cached.attempts = attempts;
    if (dbReady()) {
      try {
        await OtpCode.updateOne({ phone: key }, { $set: { attempts } });
      } catch (err) {
        console.warn('OTP store attempt notice:', err.message);
      }
    }
  },

  /** Test helper. Clears both layers. */
  async _reset() {
    memory.clear();
    if (dbReady()) {
      try { await OtpCode.deleteMany({}); } catch (err) { /* ignore */ }
    }
  }
};
