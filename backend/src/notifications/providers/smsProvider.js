const config = require('../../config');
const Logger = require('../../utils/logger');

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

/**
 * SMS delivery.
 *
 * The previous version had a dangerous failure mode. If SMS_DRIVER was 'twilio'
 * but the client could not be built (bad credentials, missing package, no from
 * number), it logged a warning and then silently fell through to the local
 * driver, which prints the message to stdout and returns success: true.
 *
 * In production that meant: the landlord's OTP was written to the server log in
 * plain text, the API told them "code sent", and no SMS ever arrived. Login
 * would appear broken for reasons nothing in the response explained, and anyone
 * with log access could read live verification codes.
 *
 * Now, in production, a misconfigured Twilio driver fails loudly instead of
 * pretending to work, and OTP content is never written to logs.
 */
class SmsProvider {
  constructor() {
    this.driver = config.sms.driver;
    this.twilioClient = null;
    this.initError = null;

    if (this.driver === 'twilio') {
      const { accountSid, authToken, fromNumber } = config.sms.twilio;
      const missing = [];
      if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
      if (!authToken) missing.push('TWILIO_AUTH_TOKEN');
      if (!fromNumber) missing.push('TWILIO_PHONE_NUMBER');

      if (missing.length) {
        this.initError = `SMS_DRIVER is 'twilio' but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`;
      } else {
        try {
          const twilio = require('twilio');
          this.twilioClient = twilio(accountSid, authToken);
          Logger.info('Twilio SMS driver ready.');
        } catch (e) {
          this.initError = `Twilio client could not be created: ${e.message}`;
        }
      }

      if (this.initError) {
        // Refuse to start rather than quietly degrade to logging OTPs.
        if (isProduction) throw new Error(`FATAL: ${this.initError}`);
        Logger.warn(`${this.initError} Falling back to the local driver (development only).`);
      }
    } else if (isProduction) {
      // Deliberately a loud warning and not a crash. SMS only affects landlord
      // login. Browsing listings, contacting a landlord on WhatsApp and the whole
      // admin portal work without it, so taking the site down over this would
      // punish every visitor for a feature most of them never touch.
      Logger.warn(
        `SMS_DRIVER is '${this.driver}' in production. Landlords cannot receive verification codes, ` +
        'so OTP login will return a clear error until Twilio credentials are configured.'
      );
    }
  }

  async sendSms(toPhone, message) {
    if (this.driver === 'twilio') {
      if (!this.twilioClient) {
        // Only reachable in development, since production throws at construction.
        const err = new Error(this.initError || 'Twilio driver requested but not initialised.');
        err.code = 'SMS_DRIVER_UNAVAILABLE';
        throw err;
      }
      try {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: config.sms.twilio.fromNumber,
          to: toPhone
        });
        Logger.info(`Twilio SMS dispatched to ${toPhone}`, { sid: result.sid });
        return { success: true, sid: result.sid, provider: 'twilio' };
      } catch (err) {
        // Report the failure rather than returning a cheerful success. The caller
        // needs to tell the landlord the code could not be sent.
        Logger.error(`Twilio dispatch failed for ${toPhone}:`, { error: err.message });
        const wrapped = new Error(`Could not send the verification SMS: ${err.message}`);
        wrapped.code = 'SMS_SEND_FAILED';
        wrapped.statusCode = 502;
        throw wrapped;
      }
    }

    // Local development and test driver.
    //
    // Never print message bodies in production. They contain live OTP codes, and
    // platform logs are readable by anyone with dashboard access.
    if (isProduction) {
      throw new Error("FATAL: SMS_DRIVER is 'local' in production. Verification codes would be written to logs instead of sent. Set SMS_DRIVER=twilio with real credentials.");
    }

    console.log('\n========================================');
    console.log(`[LOCAL SMS DISPATCH] To: ${toPhone}`);
    console.log(`[MESSAGE CONTENT]: ${message}`);
    console.log('========================================\n');

    return {
      success: true,
      sid: `local_${Date.now()}`,
      provider: 'local_simulated',
      message: 'Simulated SMS logged locally'
    };
  }
}

module.exports = new SmsProvider();
