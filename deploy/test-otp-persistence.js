// Proves OTP codes now survive outside a single process, which is what let us
// lift the Cloud Run single instance cap.
//
// Simulates two instances: process A issues the code, then a SEPARATE AuthService
// module registry (fresh require cache, empty in-memory Map) verifies it. Before
// this change that second step always failed.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const yaml = fs.readFileSync(path.join(__dirname, 'cloudrun-env.yaml'), 'utf8');
process.env.MONGODB_URI = yaml.match(/^MONGODB_URI:\s*"([^"]+)"/m)[1];
process.env.NODE_ENV = 'test';

const PHONE = '+27820001234';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log('connected to', mongoose.connection.host);

  const OtpCode = require('../backend/src/models/OtpCode');
  await OtpCode.deleteMany({ phone: { $in: [PHONE, '0820001234'] } });

  // --- instance A issues the code
  const storeA = require('../backend/src/services/otpStore');
  const entry = {
    otp: '654321',
    createdAt: Date.now(),
    cooldownExpiresAt: Date.now() - 1,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
    maxAttempts: 5,
    phone: PHONE
  };
  await storeA.set(PHONE, entry);
  console.log('instance A issued a code');

  const doc = await OtpCode.findOne({ phone: PHONE }).lean();
  console.log('  persisted in MongoDB:', doc ? 'YES' : 'NO');
  console.log('  TTL field expireAt  :', doc && doc.expireAt ? doc.expireAt.toISOString() : 'MISSING');

  // --- instance B: fresh module registry, so its in-memory Map is empty
  Object.keys(require.cache)
    .filter((k) => k.includes('otpStore'))
    .forEach((k) => delete require.cache[k]);
  const storeB = require('../backend/src/services/otpStore');
  const seen = await storeB.get(PHONE);
  console.log('instance B (empty memory) read the code:', seen && seen.otp === '654321' ? 'YES' : 'NO');

  // --- attempt counter crosses instances too
  await storeB.setAttempts(PHONE, 3);
  const after = await storeA.get(PHONE);
  console.log('attempt count visible to instance A:', after ? after.attempts : 'n/a');

  // --- TTL index present
  const idx = await OtpCode.collection.indexes();
  const ttl = idx.find((i) => i.expireAfterSeconds !== undefined);
  console.log('TTL index:', ttl ? `${JSON.stringify(ttl.key)} expireAfterSeconds=${ttl.expireAfterSeconds}` : 'MISSING');

  await storeA.delete(PHONE);
  const gone = await OtpCode.findOne({ phone: PHONE });
  console.log('cleanup removed it:', gone ? 'NO' : 'YES');

  await mongoose.disconnect();
  const ok = doc && seen && seen.otp === '654321' && after && after.attempts === 3 && ttl && !gone;
  console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
