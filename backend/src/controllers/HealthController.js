const mongoose = require('mongoose');
const ApiResponse = require('../utils/apiResponse');

const isProduction = (process.env.NODE_ENV || 'development') === 'production';

class HealthController {
  async getHealth(req, res) {
    const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
    const memoryUsage = process.memoryUsage();

    // In production, report NOT healthy until MongoDB is actually connected.
    //
    // server.js starts listening before connectDatabase() resolves, so for the
    // first seconds after a container starts (which on a free plan happens every
    // time the service wakes from sleep) the app can serve requests while still
    // on the in-memory fallback store. Anything written in that window is lost
    // when the process next restarts.
    //
    // Returning 503 makes the platform's health check hold traffic back until
    // the database is genuinely up, instead of the app cheerfully claiming to be
    // healthy while it quietly drops writes.
    const notReady = isProduction && !isDbConnected;

    return res.status(notReady ? 503 : 200).json({
      status: notReady ? 'starting' : 'healthy',
      database: isDbConnected ? 'connected' : 'fallback_ready',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      system: {
        nodeVersion: process.version,
        memoryUsageMb: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024)
        }
      }
    });
  }
}

module.exports = new HealthController();
