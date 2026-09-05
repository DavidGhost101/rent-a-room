require('dotenv').config();
const { connectDatabase } = require('./backend/src/database/connection');
const BackgroundJobRunner = require('./backend/src/jobs/backgroundJobRunner');
const app = require('./backend/src/app');

// Process-level crash guards to ensure 100% uptime in Cloud Run
process.on('uncaughtException', (err) => {
  console.error('Server Uncaught Exception (handled):', err && err.message ? err.message : err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('Server Unhandled Rejection (handled):', reason && reason.message ? reason.message : reason);
});

// Cloud Run (and most hosts) inject the port to listen on via the PORT env var
// and reject the container if it listens anywhere else. 3000 stays the local default.
const PORT = Number(process.env.PORT) || 3000;
let server;

if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Rent A Room Soweto Production Backend running on http://0.0.0.0:${PORT}`);
    console.log(`API Documentation available at http://0.0.0.0:${PORT}/api/docs`);
    console.log(`Health Check: http://0.0.0.0:${PORT}/health`);

    try {
      await connectDatabase();
      BackgroundJobRunner.start();
    } catch (e) {
      // In production connectDatabase only throws when the database is genuinely
      // unusable. Carrying on would serve a healthy looking app backed by memory
      // that loses everything on the next restart, so exit and let Cloud Run
      // surface the failure instead.
      if ((process.env.NODE_ENV || 'development') === 'production') {
        console.error('FATAL: database unavailable in production:', e.message);
        process.exit(1);
      }
      console.warn('Database initialization notice:', e.message);
    }
  });

  server.on('error', (err) => {
    console.error('Server error encountered:', err);
  });

  process.on('SIGTERM', () => {
    if (server) {
      server.close(() => {
        console.log('Server terminated cleanly.');
        process.exit(0);
      });
    }
  });
}

module.exports = app;
