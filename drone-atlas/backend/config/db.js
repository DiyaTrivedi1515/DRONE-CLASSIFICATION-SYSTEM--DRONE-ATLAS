// config/db.js
// MongoDB connection via Mongoose

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/drone_classify_atlas';

const OPTIONS = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(MONGO_URI, OPTIONS);
    isConnected = true;

    console.log(`✅  MongoDB connected → ${mongoose.connection.host}/${mongoose.connection.name}`);

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected — reconnecting…');
      isConnected = false;
    });

    mongoose.connection.on('error', err => {
      console.error('❌  MongoDB error:', err.message);
    });

  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, mongoose };
