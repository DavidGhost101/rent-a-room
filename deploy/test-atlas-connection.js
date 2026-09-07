// Connects to Atlas using the URI in deploy/cloudrun-env.yaml and reports what it
// finds. Prints the host only, never the credentials.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const yaml = fs.readFileSync(path.join(__dirname, 'cloudrun-env.yaml'), 'utf8');
const m = yaml.match(/^MONGODB_URI:\s*"([^"]+)"/m);
if (!m) { console.error('MONGODB_URI not found in cloudrun-env.yaml'); process.exit(1); }
const uri = m[1];

(async () => {
  const safeHost = uri.replace(/\/\/[^@]*@/, '//<credentials>@');
  console.log('Connecting to', safeHost);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log('CONNECTED');
  console.log('  host:', mongoose.connection.host);
  console.log('  db  :', mongoose.connection.name);
  const cols = await mongoose.connection.db.listCollections().toArray();
  if (!cols.length) console.log('  (database is empty, expected before first deploy)');
  for (const c of cols) {
    const n = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(`  ${c.name}: ${n} documents`);
  }
  const admin = await mongoose.connection.db.admin().serverStatus().catch(() => null);
  if (admin) console.log('  server version:', admin.version);
  await mongoose.disconnect();
  console.log('OK');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
