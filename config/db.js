const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('SYSTEM: DATABASE_CONNECTED');
  } catch (err) {
    console.error('SYSTEM_ERROR: DATABASE_CONNECTION_FAILED', err);
    process.exit(1);
  }
};

module.exports = connectDB;
