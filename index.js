require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const { connectDatabase } = require("./src/db");
const { createAuthRouter } = require("./src/routes/auth");
const { createApiRouter } = require("./src/routes/api");
const { attachSocket } = require("./src/socket");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 30000,
  pingInterval: 10000
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".css") || req.path.endsWith(".js")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

async function bootstrap() {
  const db = await connectDatabase();
  const runtime = {
    db,
    io,
    rooms: new Map(),
    metrics: { sockets: 0, roomsCreated: 0, chatMessages: 0, gamesStarted: 0 }
  };

  app.use("/api/auth", createAuthRouter(runtime));
  app.use("/api", createApiRouter(runtime));

  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      app: "VOID MAFIA",
      version: "13.0.0",
      mongodb: db.enabled ? "connected" : "disabled",
      rooms: runtime.rooms.size,
      metrics: runtime.metrics,
      uptime: process.uptime()
    });
  });

  attachSocket(io, runtime);

  app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

  server.listen(PORT, () => {
    console.log(`VOID MAFIA v13 Stable running on ${PORT}`);
    console.log(db.enabled ? "MongoDB enabled" : "MongoDB disabled");
  });
}

bootstrap().catch(err => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
