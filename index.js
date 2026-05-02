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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 25000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6
});

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "void_mafia_v12_dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

/*
  Prevent old HTML / JS / CSS from being stuck in browser cache.
  Useful on Render after each GitHub deploy.
*/
app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path.endsWith(".html") ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".css")
  ) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    maxAge: 0
  })
);

async function bootstrap() {
  try {
    const db = await connectDatabase();
    const store = new InMemoryStore();

    const ctx = createContext({
      io,
      store,
      db
    });

    app.use("/api/auth", createAuthRouter(ctx));
    app.use("/api", createApiRouter(ctx));
    app.use("/diag", createDiagnosticsRouter(ctx));

    attachSocketServer(io, ctx);

    app.get("/health", (req, res) => {
      res.json({
        ok: true,
        app: "VOID MAFIA",
        version: "12.0.0",
        db: db && db.enabled ? "enabled" : "memory",
        rooms:
          store && typeof store.roomsList === "function"
            ? store.roomsList().length
            : 0,
        uptime: process.uptime()
      });
    });

    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });

    server.listen(PORT, () => {
      console.log(`VOID MAFIA v12 Ultimate Engine running on ${PORT}`);

      if (db && db.enabled) {
        console.log("MongoDB enabled");
      } else {
        console.log("MongoDB disabled: memory fallback enabled");
      }

      console.log(`Admin IDs: ${ctx.security?.adminIds?.join(",") || "none"}`);
    });
  } catch (err) {
    console.error("Server bootstrap failed:", err);
    process.exit(1);
  }
}

bootstrap();
