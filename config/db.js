const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // თუ MONGO_URI არ არსებობს, პროცესი აქ შეწყდება და ლოგში დაწერს მიზეზს
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is missing in Environment Variables');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ SYSTEM: DATABASE_CONNECTED');
  } catch (err) {
    console.error('❌ SYSTEM_ERROR: DATABASE_CONNECTION_FAILED:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
