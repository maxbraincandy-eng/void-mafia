require("dotenv").config();

const http = require("http");
const express = require("express");
const session = require("express-session");
const path = require("path");
const { Server } = require("socket.io");

const { connectDatabase } = require("./src/config/database");
const { createContext } = require("./src/config/context");
const { createApiRouter } = require("./src/routes/api");
const { createAuthRouter } = require("./src/routes/auth");
const { createDiagnosticsRouter } = require("./src/routes/diagnostics");
const { attachSocketServer } = require("./src/socket");
const { InMemoryStore } = require("./src/services/InMemoryStore");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 25000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "void_mafia_v12_dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "15m" : 0
}));

(async function bootstrap() {
  const db = await connectDatabase();
  const store = new InMemoryStore();
  const ctx = createContext({ io, store, db });

  app.use("/api/auth", createAuthRouter(ctx));
  app.use("/api", createApiRouter(ctx));
  app.use("/diag", createDiagnosticsRouter(ctx));

  attachSocketServer(io, ctx);

  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  server.listen(PORT, () => {
    console.log(`VOID MAFIA v12 Ultimate Engine running on ${PORT}`);
    console.log(db.enabled ? "MongoDB enabled" : "MongoDB disabled: memory fallback enabled");
    console.log(`Admin IDs: ${ctx.security.adminIds.join(",") || "none"}`);
  });
})();
