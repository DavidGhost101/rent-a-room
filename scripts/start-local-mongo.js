// Starts a REAL mongod locally (downloaded by mongodb-memory-server, already a
// devDependency) and writes its connection string to scripts/local-mongo-uri.txt.
//
// Purpose: exercise the actual Mongoose code path. Everything tested so far ran
// on the in-memory fallback store, so the real database path has never run.
//
//   node scripts/start-local-mongo.js      (leave it running)

const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  console.log('Starting local mongod (first run downloads the binary)...');
  const mongo = await MongoMemoryServer.create({
    instance: { port: 27017, dbName: 'rentaroom' }
  });
  const uri = mongo.getUri('rentaroom');
  const out = path.join(__dirname, 'local-mongo-uri.txt');
  fs.writeFileSync(out, uri);
  console.log('MONGO_READY');
  console.log('URI:', uri);
  console.log('Leave this process running. Ctrl+C to stop.');

  const shutdown = async () => { await mongo.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
