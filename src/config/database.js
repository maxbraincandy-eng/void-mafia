const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return { enabled: false, mongoose: null, reason: "MONGODB_URI missing" };
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000
    });
    return { enabled: true, mongoose };
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    return { enabled: false, mongoose: null, reason: err.message };
  }
}

module.exports = { connectDatabase };
