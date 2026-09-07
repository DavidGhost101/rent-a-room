const mongoose = require('mongoose');

/**
 * A pending SMS OTP.
 *
 * These used to live only in a module level Map inside AuthService, which meant
 * a landlord could request a code on one server instance and have the verify
 * request land on another where the Map was empty, so login failed at random.
 * That is why Cloud Run was pinned to a single instance. Persisting them here
 * removes that constraint.
 *
 * Codes are short lived, so MongoDB's TTL monitor deletes each document at
 * expireAt rather than the app having to sweep them.
 */
const otpCodeSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  otp: { type: String, required: true },
  cooldownExpiresAt: { type: Number, required: true },
  expiresAt: { type: Number, required: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  createdAt: { type: Number, default: () => Date.now() },
  // TTL anchor. MongoDB removes the document once this time passes.
  expireAt: { type: Date, required: true }
});

otpCodeSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.OtpCode || mongoose.model('OtpCode', otpCodeSchema);
