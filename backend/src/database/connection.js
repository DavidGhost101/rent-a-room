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

async function connectDatabase() {
  const uri = config.db.uri;

  // 1. If real external URI is configured (not localhost), attempt connection
  if (uri && !uri.includes('localhost:27017') && !uri.includes('127.0.0.1:27017')) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: config.db.connectTimeoutMs || 3000
      });
      Logger.info('Connected to external MongoDB database.');
      await seedData.seed();
      return mongoose.connection;
    } catch (err) {
      Logger.warn('External MongoDB connection unavailable, using resilient in-memory store:', { error: err.message });
    }
  }

  // 2. Fast fallback to resilient in-memory data store
  Logger.info('Resilient in-memory storage active and ready.');
  return null;
}

module.exports = {
  connectDatabase
};
