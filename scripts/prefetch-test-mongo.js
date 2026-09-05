// The test suite pins mongodb-memory-server to MongoDB 7.0.14. On a machine that
// has never run the tests, jest's 60s hook timeout expires while that ~590MB
// binary is still downloading, so every test fails for a reason that has nothing
// to do with the code. Run this once to warm the cache:
//
//   node scripts/prefetch-test-mongo.js
//
// then `npm test` runs normally.

const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  console.log('Fetching MongoDB 7.0.14 for the test suite (one time, ~590MB)...');
  const m = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  console.log('Ready:', m.getUri());
  await m.stop();
  console.log('CACHED. `npm test` will now start immediately.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
