"use strict";
const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");

// [TR] Frontend'den gelen kritik hataları merkezi dosyaya yazar
router.post("/client-error", (req, res) => {
  const { message, stack, url } = req.body;
  
  logger.error(`[FRONTEND-ERROR]`, {
    client_message: message,
    client_url: url,
    stack: stack,
    user_agent: req.headers["user-agent"]
  });

  res.status(204).end(); // Yük bindirmemek için boş cevap dön
});

module.exports = router;
