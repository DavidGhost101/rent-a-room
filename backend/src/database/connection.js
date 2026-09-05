const mongoose = require('mongoose');
const config = require('../config');
const Logger = require('../utils/logger');
const seedData = require('./seedData');

// Ensure buffered commands fail fast rather than hanging (a genuinely
// unreachable MongoDB should fall back to the in-memory store immediately,
// not block the request). NOTE: this does mean a handful of specific
// operations racing the very first connection handshake can also take the
// fallback path instead of hitting real Mongo -- see README/audit notes.
// Tried raising bufferTimeoutMS instead of disabling buffering outright, but
// that made things worse under Jest's default 5s per-test timeout (queries
// that were failing fast now blocked until the buffer timeout, exceeding the
// test timeout itself) -- reverted.
mongoose.set('bufferCommands', false);

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

/**
 * Connect to MongoDB.
 *
 * Development: if the database is unreachable, fall back to the in-memory store
 * so the app still runs. Convenient, and harmless because nothing is real yet.
 *
 * Production: NEVER silently fall back. Serving from the in-memory store looks
 * completely healthy -- listings save, admin approves, the smoke test passes --
 * and then every listing, landlord and room request disappears the moment the
 * container restarts, which on Cloud Run happens routinely. Failing to boot is
 * far better than silently losing your users' data.
 */
async function connectDatabase() {
  const uri = config.db.uri;

  if (!uri) {
    if (isProduction) {
      throw new Error(
        'MONGODB_URI is not set. Refusing to start in production on the in-memory store, ' +
        'which would silently lose all data on every restart.'
      );
    }
    Logger.info('No MONGODB_URI configured. Resilient in-memory storage active (development only).');
    return null;
  }

  try {
    // Previously this skipped any localhost/127.0.0.1 URI outright, which meant a
    // developer running MongoDB locally -- exactly what .env.example and
    // docker-compose.yml tell them to do -- silently got the in-memory store and
    // an empty database, with no error anywhere. Any configured URI is now tried.
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: config.db.connectTimeoutMs || 3000
    });
    Logger.info('Connected to MongoDB.', { host: mongoose.connection.host, db: mongoose.connection.name });
    await seedData.seed();
    return mongoose.connection;
  } catch (err) {
    if (isProduction) {
      Logger.error(
        'MONGODB_URI is set but the database is unreachable. Refusing to start in production ' +
        'on the in-memory store. Check the connection string, the database user password, and ' +
        'that this service IP is allowed in Atlas Network Access.',
        { error: err.message }
      );
      throw err;
    }
    Logger.warn('MongoDB unavailable, using resilient in-memory store (development only):', { error: err.message });
  }

  Logger.info('Resilient in-memory storage active and ready.');
  return null;
}

module.exports = {
  connectDatabase
};
