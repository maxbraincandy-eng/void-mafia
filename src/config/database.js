const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return {
      enabled: false,
      mongoose: null,
      models: {}
    };
  }

  try {
    mongoose.set("strictQuery", true);

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10
    });

    console.log("MongoDB connected");

    mongoose.connection.on("error", err => {
      console.error("MongoDB error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected");
    });

    const models = require("../models");

    return {
      enabled: true,
      mongoose,
      models
    };
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);

    return {
      enabled: false,
      mongoose: null,
      models: {}
    };
  }
}

module.exports = {
  connectDatabase
};
