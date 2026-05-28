// scripts/seed.js
// Populate MongoDB with sample classification records for testing
// Run: node scripts/seed.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const Classification = require('../models/Classification');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/drone_classify_atlas';

const CLASSES = ['Hexacopter', 'Octacopter', 'Quadcopter', 'Single_motor', 'Tricopter'];

function rnd(min, max) { return Math.random() * (max - min) + min; }

function makeRecord(i) {
  const cls   = CLASSES[Math.floor(Math.random() * CLASSES.length)];
  const raw   = CLASSES.map(() => rnd(0.05, 1));
  const sum   = raw.reduce((a, b) => a + b, 0);
  const norm  = raw.map(v => v / sum);
  const topI  = CLASSES.indexOf(cls);
  // Boost the correct class so it looks like a real model
  const boosted = norm.map((v, j) => j === topI ? rnd(0.55, 0.98) : v);
  const bsum    = boosted.reduce((a, b) => a + b, 0);
  const final   = boosted.map(v => v / bsum);

  const daysAgo = rnd(0, 30);
  const date    = new Date(Date.now() - daysAgo * 86400000);

  return {
    filename:         `drone_scan_${String(i).padStart(4, '0')}.jpg`,
    predictedClass:   cls,
    confidence:       final[topI],
    allProbabilities: Object.fromEntries(CLASSES.map((c, j) => [c, final[j]])),
    scannedAt:        date,
    ipAddress:        '127.0.0.1',
  };
}

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Clear existing records
  const deleted = await Classification.deleteMany({});
  console.log(`Cleared ${deleted.deletedCount} existing records`);

  // Insert 80 sample records
  const records = Array.from({ length: 80 }, (_, i) => makeRecord(i + 1));
  await Classification.insertMany(records);
  console.log(`✅  Inserted ${records.length} sample classification records`);

  const dist = await Classification.getClassDistribution();
  console.log('\nClass distribution:');
  dist.forEach(({ _id, count }) => console.log(`  ${_id.padEnd(14)} ${count}`));

  await mongoose.disconnect();
  console.log('\nDone. Disconnected.');
})();
