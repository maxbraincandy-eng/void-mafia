const express = require("express");

function createDiagnosticsRouter(ctx) {
  const router = express.Router();

  router.get("/status", (req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      metrics: ctx.metrics.snapshot(),
      rooms: ctx.store.roomsList().map(r => ({
        id: r.id,
        name: r.name,
        phase: r.phase,
        players: r.players.length,
        spectators: r.spectators.length
      }))
    });
  });

  return router;
}

module.exports = { createDiagnosticsRouter };
