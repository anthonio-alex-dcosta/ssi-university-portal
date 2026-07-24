const express = require("express");
const cors = require("cors");
const session = require("express-session");

const config = require("./config");
const loginRoutes = require("./routes/login");
const { router: adminRoutes } = require("./routes/admin");
const { router: protectedRoutes } = require("./routes/protected");
const messagingRoutes = require("./routes/messaging");
const webhookRoutes = require("./webhooks");

const app = express();
app.set("trust proxy", 1);

// Webhooks come from ACA-Py (same docker network), not the browser — mount
// the raw JSON parser for them before CORS/session, they don't need either.
app.use("/webhooks", express.json(), webhookRoutes);

const allowedOrigins = new Set([
  config.frontendOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients (curl, ACA-Py) send no Origin.
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/login", loginRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/messaging", messagingRoutes);
app.use("/api", protectedRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
  console.log(`ACA-Py admin URL: ${config.universityAdminUrl}`);
});
