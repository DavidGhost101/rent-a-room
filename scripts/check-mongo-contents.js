// Did anything the API created actually reach MongoDB, or only the fallback store?
const mongoose = require('mongoose');

(async () => {
  const uri = process.argv[2] || 'mongodb://127.0.0.1:27017/rentaroom';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const cols = await mongoose.connection.db.listCollections().toArray();
  if (!cols.length) {
    console.log('DATABASE IS EMPTY - no collections at all');
  }
  for (const c of cols) {
    const n = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(`${c.name}: ${n} documents`);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
