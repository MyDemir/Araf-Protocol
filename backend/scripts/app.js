"use strict";

require("dotenv").config();
const express       = require("express");
const helmet        = require("helmet");
const cors          = require("cors");
const mongoSanitize = require("express-mongo-sanitize");

const { connectDB }    = require("./config/db");
const { connectRedis } = require("./config/redis");
const logger           = require("./utils/logger");

// ── Routes (her biri ayrı dosyada) ───────────────────────────────────────────
const authRoutes     = require("./routes/auth");
const listingRoutes  = require("./routes/listings");
const tradeRoutes    = require("./routes/trades");
const piiRoutes      = require("./routes/pii");
const feedbackRoutes = require("./routes/feedback");

const { globalErrorHandler } = require("./middleware/errorHandler");

const app = express();

// ── Güvenlik Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || "http://localhost:5173").split(","),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json({ limit: "50kb" }));

// MongoDB injection koruması — $gt, $where gibi operatörleri temizler
app.use(mongoSanitize({
  replaceWith: "_",
  onSanitize: ({ key }) => logger.warn(`[GÜVENLİK] Mongo injection denemesi: ${key}`),
}));

// ── Route Bağlantıları ────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/trades",   tradeRoutes);
app.use("/api/pii",      piiRoutes);
app.use("/api/feedback", feedbackRoutes);

// ── Sağlık Kontrolü ───────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: Date.now() }));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route bulunamadı" }));

// ── Global Hata Yakalayıcı ────────────────────────────────────────────────────
app.use(globalErrorHandler);

// ── Başlatma ──────────────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB();
  await connectRedis();

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    logger.info(`Araf Protocol Backend — :${PORT} portunda dinleniyor`);
    logger.info(`Ortam: ${process.env.NODE_ENV}`);
    logger.warn("Zero Private Key modu: Backend hiçbir cüzdan anahtarı tutmuyor.");
  });
}

bootstrap().catch((err) => {
  logger.error("Başlatma hatası:", err);
  process.exit(1);
});

module.exports = app;
