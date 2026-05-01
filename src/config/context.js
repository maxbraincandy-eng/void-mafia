const { parseCsv } = require("../utils/text");
const { Metrics } = require("../telemetry/Metrics");

function createContext({ io, store, db }) {
  return {
    io,
    store,
    db,
    metrics: new Metrics(),
    security: {
      adminIds: parseCsv(process.env.ADMIN_IDS || ""),
      monitorIds: parseCsv(process.env.MONITOR_IDS || "")
    },
    config: {
      appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
      userIdStart: Number(process.env.USER_ID_START || 1)
    }
  };
}

module.exports = { createContext };
