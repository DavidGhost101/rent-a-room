const path = require('path');
require('dotenv').config();

function sanitizeTimespan(val, fallback) {
  if (typeof val === 'number' && val > 0) return val;
  if (typeof val === 'string' && /^\d+[smhdwy]$/i.test(val.trim())) return val.trim();
  return fallback;
}

function sanitizeSecret(val, fallback) {
  if (typeof val === 'string' && val.trim().length >= 8 && !val.includes('replace_with_')) {
    return val.trim();
  }
  return fallback;
}

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

// SECURITY: in production, secrets must come from the environment. There is no
// hardcoded fallback that would let the app silently boot with a known/guessable
// secret. Non-production environments (dev/test) get a clearly-marked local-only
// fallback so `npm test` / `npm run dev` keep working without a .env file.
function requireSecretInProduction(val, name, devFallback) {
  const clean = sanitizeSecret(val, null);
  if (clean) return clean;
  if (isProduction) {
    throw new Error(
      `${name} must be set to a real secret in production. Refusing to start with no/placeholder value.`
    );
  }
  return devFallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',

  jwt: {
    secret: requireSecretInProduction(process.env.JWT_SECRET, 'JWT_SECRET', 'dev_only_jwt_secret_do_not_use_in_prod'),
    accessExpiresIn: sanitizeTimespan(process.env.JWT_EXPIRES_IN, '2h'),
    refreshExpiresIn: sanitizeTimespan(process.env.JWT_REFRESH_EXPIRES_IN, '7d'),
    refreshSecret: requireSecretInProduction(process.env.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET', 'dev_only_jwt_refresh_secret_do_not_use_in_prod')
  },

  admin: {
    // SECURITY: no hardcoded admin key. In production ADMIN_KEY is mandatory.
    // In dev/test, a fixed local-only value keeps the admin dashboard usable
    // without extra setup, but it is never accepted in production.
    // Defined as a live getter (re-reads process.env.ADMIN_KEY on every access,
    // not just once at boot) so ops can rotate the key without a restart, and
    // so test suites that set process.env.ADMIN_KEY at runtime work correctly.
    get key() {
      return requireSecretInProduction(process.env.ADMIN_KEY, 'ADMIN_KEY', 'dev_only_admin_key_do_not_use_in_prod');
    }
  },
  
  db: {
    uri: process.env.MONGODB_URI || '',
    connectTimeoutMs: 2500
  },
  
  sms: {
    driver: process.env.SMS_DRIVER || 'local',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      fromNumber: process.env.TWILIO_PHONE_NUMBER || ''
    }
  },
  
  email: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    fromAddress: process.env.EMAIL_FROM || 'noreply@rentaroomsoweto.co.za'
  },
  
  whatsapp: {
    apiKey: process.env.WHATSAPP_API_KEY || '',
    fromNumber: process.env.WHATSAPP_PHONE_NUMBER || ''
  },
  
  security: {
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY || '',
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    bcryptSaltRounds: 10,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 mins
    rateLimitMax: 300
  },

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || ''
  }
};

// Fail fast at boot in production if ADMIN_KEY is missing/placeholder, rather than
// waiting for the first admin request to discover it.
if (isProduction) {
  void config.admin.key;
}

module.exports = config;
