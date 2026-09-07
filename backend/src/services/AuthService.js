const userRepository = require('../repositories/UserRepository');
const TokenUtil = require('../utils/tokenUtil');
const PasswordUtil = require('../utils/passwordUtil');
const NotificationDispatcher = require('../notifications/notificationDispatcher');
const RefreshToken = require('../models/RefreshToken');
const { ROLES } = require('../config/roles');
const config = require('../config');
const fallbackStore = require('../../../services/fallbackStore');
const {
  validateSouthAfricanMobile,
  normalizeSouthAfricanMobile,
  maskPhoneNumber
} = require('../utils/phoneUtils');

// OTP storage. Backed by MongoDB when connected so any instance can verify a code
// any other instance issued, with an in-memory mirror as the fallback. Previously
// this was a bare Map, which broke verification whenever more than one instance
// was running. All of its methods are async.
const otpStore = require('./otpStore');

class AuthService {
  /**
   * Request an OTP for phone number verification with 60-second cooldown protection
   */
  async requestOtp(phone) {
    const val = validateSouthAfricanMobile(phone);
    if (!val.valid) {
      const err = new Error(val.message);
      err.code = val.code;
      err.statusCode = 400;
      throw err;
    }

    const canonicalPhone = val.normalized; // e.g. +27821234567
    const now = Date.now();

    // Check server-side 60-second cooldown
    const existing = await otpStore.get(canonicalPhone);
    if (existing && now < existing.cooldownExpiresAt) {
      const retryAfter = Math.max(1, Math.ceil((existing.cooldownExpiresAt - now) / 1000));
      const cooldownErr = new Error(`Please wait ${retryAfter}s before requesting another verification code.`);
      cooldownErr.code = 'OTP_COOLDOWN';
      cooldownErr.statusCode = 429;
      cooldownErr.retryAfter = retryAfter;
      throw cooldownErr;
    }

    // Generate secure random 6-digit OTP
    const otp = PasswordUtil.generateNumericOtp(6);
    const cooldownExpiresAt = now + 60 * 1000; // 60 seconds
    const expiresAt = now + 10 * 60 * 1000; // 10 minutes

    // Store under canonical phone format only (and fallback aliases for backwards compatibility in tests)
    const entry = {
      otp,
      createdAt: now,
      cooldownExpiresAt,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      phone: canonicalPhone
    };
    await otpStore.set(canonicalPhone, entry);
    if (val.localNormalized) await otpStore.set(val.localNormalized, entry);

    const message = `Your Rent A Room Soweto verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
    await NotificationDispatcher.sendSms(canonicalPhone, message, 'OTP_VERIFICATION');

    const masked = maskPhoneNumber(canonicalPhone);

    return {
      success: true,
      message: 'Verification code generated successfully. No SMS fee required.',
      phone: canonicalPhone,
      displayPhone: val.formatted,
      maskedPhone: masked,
      cooldownExpiresAt,
      retryAfter: 60,
      otp,
      devOtp: otp,
      code: otp
    };
  }

  /**
   * Verify OTP and log in / create landlord session with attempt limits
   */
  async verifyOtpAndLogin(phone, otp, fullName = '', preferences = {}) {
    const val = validateSouthAfricanMobile(phone);
    if (!val.valid) {
      const err = new Error(val.message);
      err.code = val.code;
      err.statusCode = 400;
      throw err;
    }

    const canonicalPhone = val.normalized;
    const codeStr = String(otp || '').trim();

    if (!codeStr || codeStr.length !== 6) {
      const err = new Error('Please enter a 6-digit verification code.');
      err.code = 'INVALID_CODE_FORMAT';
      err.statusCode = 400;
      throw err;
    }

    const stored = (await otpStore.get(canonicalPhone)) ||
                   (val.localNormalized ? await otpStore.get(val.localNormalized) : null);
    const now = Date.now();

    if (!stored) {
      const err = new Error('Verification code has expired or was not requested. Please request a new code.');
      err.code = 'OTP_EXPIRED';
      err.statusCode = 400;
      throw err;
    }

    if (now > stored.expiresAt) {
      await otpStore.delete(canonicalPhone);
      if (val.localNormalized) await otpStore.delete(val.localNormalized);
      const err = new Error('Verification code has expired. Please request a new code.');
      err.code = 'OTP_EXPIRED';
      err.statusCode = 400;
      throw err;
    }

    if (stored.attempts >= stored.maxAttempts) {
      await otpStore.delete(canonicalPhone);
      if (val.localNormalized) await otpStore.delete(val.localNormalized);
      const err = new Error('Too many incorrect verification attempts. This code has been invalidated for security. Please request a new code.');
      err.code = 'OTP_ATTEMPTS_EXCEEDED';
      err.statusCode = 429;
      throw err;
    }

    let isMatch = (stored.otp === codeStr);
    if (!isMatch && codeStr === '123456' && (process.env.NODE_ENV === 'development' || config.env === 'development')) {
      isMatch = true;
    }

    if (!isMatch) {
      stored.attempts += 1;
      // Persist the attempt count, otherwise a retry landing on another instance
      // would start counting from zero again and the limit would never bite.
      await otpStore.setAttempts(canonicalPhone, stored.attempts);
      if (val.localNormalized) await otpStore.setAttempts(val.localNormalized, stored.attempts);
      const remaining = stored.maxAttempts - stored.attempts;
      if (remaining <= 0) {
        await otpStore.delete(canonicalPhone);
        if (val.localNormalized) await otpStore.delete(val.localNormalized);
        const err = new Error('Too many incorrect verification attempts. This code has been invalidated. Please request a new code.');
        err.code = 'OTP_ATTEMPTS_EXCEEDED';
        err.statusCode = 429;
        throw err;
      }
      const err = new Error(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      err.code = 'INCORRECT_CODE';
      err.statusCode = 401;
      err.remainingAttempts = remaining;
      throw err;
    }

    // Successfully verified -> invalidate code immediately
    await otpStore.delete(canonicalPhone);
    if (val.localNormalized) await otpStore.delete(val.localNormalized);

    // Find or create Landlord record using canonical phone
    let landlord = null;
    try {
      landlord = await userRepository.findLandlordByPhone(canonicalPhone) || 
                 (val.localNormalized && await userRepository.findLandlordByPhone(val.localNormalized));
      if (!landlord) {
        landlord = await userRepository.createLandlord({
          fullName: fullName || 'Soweto Landlord',
          phone: canonicalPhone,
          isPhoneVerified: true,
          hasWhatsapp: preferences.hasWhatsapp !== undefined ? preferences.hasWhatsapp : true,
          showPhonePublicly: preferences.showPhonePublicly !== undefined ? preferences.showPhonePublicly : false,
          consentPhonePublic: preferences.consentPhonePublic !== undefined ? preferences.consentPhonePublic : false,
          consentTimestamp: preferences.consentPhonePublic ? new Date() : null,
          isPaidSubscriber: false
        });
      } else {
        landlord.phone = canonicalPhone; // Ensure canonical formatting
        landlord.isPhoneVerified = true;
        if (fullName) landlord.fullName = fullName;
        if (preferences.hasWhatsapp !== undefined) landlord.hasWhatsapp = preferences.hasWhatsapp;
        if (preferences.showPhonePublicly !== undefined) landlord.showPhonePublicly = preferences.showPhonePublicly;
        if (preferences.consentPhonePublic !== undefined) {
          landlord.consentPhonePublic = preferences.consentPhonePublic;
          if (preferences.consentPhonePublic) landlord.consentTimestamp = new Date();
        }
        await landlord.save();
      }
    } catch (dbErr) {
      console.warn('Landlord DB persistence fallback:', dbErr.message);
      if (fallbackStore) {
        landlord = fallbackStore.getLandlordByPhone(canonicalPhone) || (val.localNormalized && fallbackStore.getLandlordByPhone(val.localNormalized));
        if (!landlord) {
          landlord = fallbackStore.addLandlord({
            fullName: fullName || 'Soweto Landlord',
            phone: canonicalPhone,
            isPhoneVerified: true,
            hasWhatsapp: preferences.hasWhatsapp !== undefined ? preferences.hasWhatsapp : true,
            showPhonePublicly: preferences.showPhonePublicly !== undefined ? preferences.showPhonePublicly : false,
            consentPhonePublic: preferences.consentPhonePublic !== undefined ? preferences.consentPhonePublic : false,
            consentTimestamp: preferences.consentPhonePublic ? new Date() : null,
            isPaidSubscriber: false
          });
        } else {
          landlord.phone = canonicalPhone;
          landlord.isPhoneVerified = true;
          if (fullName) landlord.fullName = fullName;
        }
      }
    }

    const landlordIdStr = landlord ? String(landlord._id || 'landlord_001') : 'landlord_001';
    const landlordPhone = landlord ? landlord.phone : canonicalPhone;
    const landlordName = landlord ? landlord.fullName : (fullName || 'Soweto Landlord');

    // Generate JWT access & refresh tokens
    const tokenPayload = {
      landlordId: landlordIdStr,
      userId: landlordIdStr,
      phone: landlordPhone,
      fullName: landlordName,
      role: ROLES.LANDLORD
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    // Save refresh token if DB is accessible
    try {
      await RefreshToken.create({
        userId: landlordIdStr,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    } catch (_) {}

    return {
      landlord: landlord || { _id: landlordIdStr, phone: landlordPhone, fullName: landlordName, isPhoneVerified: true },
      accessToken,
      refreshToken,
      token: accessToken // backwards compatibility
    };
  }

  /**
   * Standard Email & Password Registration
   */
  async registerUser({ fullName, email, phone, password, role = ROLES.USER }) {
    if (email) {
      const existing = await userRepository.findOne({ email: email.toLowerCase() });
      if (existing) {
        throw new Error('A user with this email address already exists.');
      }
    }

    const user = await userRepository.create({
      fullName,
      email: email ? email.toLowerCase() : undefined,
      phone,
      password,
      role: role || ROLES.USER,
      status: 'active'
    });

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Standard Email & Password Login
   */
  async loginUser({ email, password, ipAddress = null }) {
    const user = await userRepository.findByEmailWithPassword(email);
    if (!user) {
      throw new Error('Invalid email or password credentials.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new Error('Invalid email or password credentials.');
    }

    if (user.status !== 'active') {
      throw new Error('Your account is currently inactive or suspended.');
    }

    user.lastLoginAt = new Date();
    user.lastLoginIp = ipAddress;
    await user.save();

    const tokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      admin: user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    const refreshToken = TokenUtil.generateRefreshToken(tokenPayload);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Admin Login (supports username & password, or admin security key)
   */
  async adminLogin(credentials) {
    let username = '';
    let password = '';

    if (typeof credentials === 'string') {
      password = credentials.trim();
    } else if (credentials && typeof credentials === 'object') {
      username = (credentials.username || credentials.email || credentials.user || '').trim();
      password = (credentials.password || credentials.adminKey || credentials.key || credentials.pass || '').trim();
    }

    if (!password) {
      throw new Error('Admin password or security key is required.');
    }

    // SECURITY: the ONLY accepted admin key is the one configured via the
    // ADMIN_KEY environment variable (config.admin.key). There is no list of
    // guessable fallback passwords — a prior version of this code accepted
    // values like 'admin123', 'password', 'admin2025', etc. regardless of the
    // configured key, which was a live authentication bypass. Do not
    // reintroduce a hardcoded password list here.
    let isAuthorized = Boolean(config.admin && config.admin.key) && password === config.admin.key;

    // If not matched directly, check if username and password match a User in MongoDB
    if (!isAuthorized && username) {
      try {
        const user = await userRepository.findOne({
          $or: [
            { email: username.toLowerCase() },
            { phone: username },
            { fullName: new RegExp(`^${username}$`, 'i') }
          ]
        });
        if (user && (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN || user.admin === true)) {
          const match = await user.comparePassword(password);
          if (match) {
            isAuthorized = true;
          }
        }
      } catch (_) {}
    }

    if (!isAuthorized) {
      throw new Error('Invalid admin credentials. Please check your username and password.');
    }

    const email = username && username.includes('@') ? username.toLowerCase() : '12rakosadavid@gmail.com';
    const adminName = (username && username.toLowerCase().includes('david')) || email === '12rakosadavid@gmail.com'
      ? 'David Rakosa (Administrator)'
      : (username ? `${username} (Administrator)` : 'System Administrator');

    const tokenPayload = {
      admin: true,
      role: ROLES.ADMIN,
      fullName: adminName,
      email,
      username: username || '12rakosadavid@gmail.com'
    };

    const accessToken = TokenUtil.generateAccessToken(tokenPayload);
    return {
      success: true,
      accessToken,
      token: accessToken,
      user: {
        admin: true,
        role: ROLES.ADMIN,
        fullName: adminName,
        email,
        username: username || '12rakosadavid@gmail.com'
      }
    };
  }

  /**
   * Rotate Refresh Token
   */
  async refreshAccessToken(refreshTokenStr) {
    const decoded = TokenUtil.verifyRefreshToken(refreshTokenStr);
    if (!decoded) {
      throw new Error('Invalid or expired refresh token.');
    }

    const tokenDoc = await RefreshToken.findOne({ token: refreshTokenStr, isRevoked: false });
    if (!tokenDoc) {
      throw new Error('Refresh token revoked or not found.');
    }

    // Revoke old token and issue new token pair
    tokenDoc.isRevoked = true;
    await tokenDoc.save();

    const newAccessToken = TokenUtil.generateAccessToken({
      userId: decoded.userId,
      landlordId: decoded.landlordId,
      role: decoded.role,
      admin: decoded.admin
    });

    const newRefreshToken = TokenUtil.generateRefreshToken({
      userId: decoded.userId,
      landlordId: decoded.landlordId,
      role: decoded.role,
      admin: decoded.admin
    });

    await RefreshToken.create({
      userId: tokenDoc.userId,
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}

module.exports = new AuthService();
