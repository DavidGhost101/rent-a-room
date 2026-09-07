// Removes automated smoke test records from the Atlas database, leaving real
// data and the seeded Soweto listings alone.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const yaml = fs.readFileSync(path.join(__dirname, 'cloudrun-env.yaml'), 'utf8');
const uri = yaml.match(/^MONGODB_URI:\s*"([^"]+)"/m)[1];

(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  console.log('connected to', mongoose.connection.host);

  const before = {
    listings: await db.collection('listings').countDocuments(),
    roomrequests: await db.collection('roomrequests').countDocuments(),
    landlords: await db.collection('landlords').countDocuments()
  };
  console.log('before:', before);

  const l = await db.collection('listings').deleteMany({
    $or: [{ title: /smoke test/i }, { address: /Smoke Test Street/i }]
  });
  const r = await db.collection('roomrequests').deleteMany({ seekerName: /smoke tenant/i });
  const d = await db.collection('landlords').deleteMany({ fullName: /smoke tester/i });

  console.log(`removed: ${l.deletedCount} listings, ${r.deletedCount} room requests, ${d.deletedCount} landlords`);

  const after = {
    listings: await db.collection('listings').countDocuments(),
    roomrequests: await db.collection('roomrequests').countDocuments(),
    landlords: await db.collection('landlords').countDocuments()
  };
  console.log('after :', after);

  await mongoose.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
