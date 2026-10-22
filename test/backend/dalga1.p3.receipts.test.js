"use strict";

jest.mock("../../backend/scripts/middleware/auth", () => ({
  requireAuth: (req, _res, next) => { req.wallet = "0x" + "1".repeat(40); next(); },
  requireSessionWalletMatch: (_req, _res, next) => next(),
}));
jest.mock("../../backend/scripts/middleware/rateLimiter", () => ({
  receiptUploadLimiter: (_req, _res, next) => next(),
}));
jest.mock("../../backend/scripts/services/encryption", () => ({ encryptField: jest.fn(async () => "enc") }));
jest.mock("../../backend/scripts/models/Trade", () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn() }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const express = require("express");
const request = require("supertest");
const receipts = require("../../backend/scripts/routes/receipts");
const { globalErrorHandler } = require("../../backend/scripts/middleware/errorHandler");

function buildApp() {
  const app = express();
  app.use("/api/receipts", receipts);
  app.use(globalErrorHandler);
  return app;
}

describe("P3 B3-01: multer hataları", () => {
  it("5 MB üstü dosya -> 413, sabit kod", async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 0x41);
    const res = await request(buildApp())
      .post("/api/receipts/upload")
      .field("onchainEscrowId", "1")
      .attach("receipt", big, { filename: "a.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("RECEIPT_TOO_LARGE");
  });

  it("desteklenmeyen MIME -> 415, sabit kod, MIME sızmaz", async () => {
    const res = await request(buildApp())
      .post("/api/receipts/upload")
      .field("onchainEscrowId", "1")
      .attach("receipt", Buffer.from("x"), { filename: "a.exe", contentType: "application/x-msdownload" });
    expect(res.status).toBe(415);
    expect(res.body.code).toBe("RECEIPT_UNSUPPORTED_TYPE");
    expect(JSON.stringify(res.body)).not.toContain("x-msdownload");
  });

  it("beklenmeyen alan adı (multer) -> 400, sabit kod", async () => {
    const res = await request(buildApp())
      .post("/api/receipts/upload")
      .attach("baska", Buffer.from("x"), { filename: "a.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("RECEIPT_UPLOAD_INVALID");
  });
});

describe("errorHandler: multer ve B2-07", () => {
  function run(err) {
    const res = {
      headersSent: false,
      statusCode: 0,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    globalErrorHandler(err, { path: "/x", method: "POST", body: {} }, res, () => {});
    return res;
  }

  it("MulterError LIMIT_FILE_SIZE -> 413", () => {
    const e = new Error("File too large"); e.name = "MulterError"; e.code = "LIMIT_FILE_SIZE";
    const r = run(e);
    expect(r.statusCode).toBe(413);
    expect(r.body.code).toBe("RECEIPT_TOO_LARGE");
  });

  it("UNSUPPORTED_MIME kodu -> 415, MIME sızmaz", () => {
    const e = new Error("UNSUPPORTED_MIME:text/x"); e.code = "UNSUPPORTED_MIME";
    const r = run(e);
    expect(r.statusCode).toBe(415);
    expect(JSON.stringify(r.body)).not.toContain("text/x");
  });

  it("B2-07: Joi tarzı ValidationError (errors yok, details var) -> 400, TypeError yok", () => {
    const e = new Error("secret internal"); e.name = "ValidationError"; e.isJoi = true;
    e.details = [{ message: "\"a\" is required" }];
    const r = run(e);
    expect(r.statusCode).toBe(400);
    expect(r.body.error).toBe("Doğrulama başarısız.");
  });

  it("B2-07: errors ve details yoksa da 400", () => {
    const e = new Error("x"); e.name = "ValidationError";
    expect(run(e).statusCode).toBe(400);
  });
});
