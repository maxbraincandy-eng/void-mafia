const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true
    },
    value: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
