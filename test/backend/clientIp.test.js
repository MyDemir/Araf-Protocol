"use strict";

const { resolveClientIp } = require("../../backend/scripts/utils/clientIp");

const SECRET = "s3cret-value";
const mkReq = (headers = {}, ip = "66.241.125.182") => ({ ip, headers });

describe("resolveClientIp", () => {
  const prev = process.env.ORIGIN_SHARED_SECRET;
  afterEach(() => {
    if (prev === undefined) delete process.env.ORIGIN_SHARED_SECRET;
    else process.env.ORIGIN_SHARED_SECRET = prev;
  });

  test("secret tanımsız: req.ip (x-real-ip yok sayılır)", () => {
    delete process.env.ORIGIN_SHARED_SECRET;
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9", "x-araf-origin-secret": SECRET }))).toBe("66.241.125.182");
  });

  test("secret boş: req.ip", () => {
    process.env.ORIGIN_SHARED_SECRET = "";
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9", "x-araf-origin-secret": "" }))).toBe("66.241.125.182");
  });

  test("doğru secret + geçerli IPv4/IPv6 x-real-ip: x-real-ip", () => {
    process.env.ORIGIN_SHARED_SECRET = SECRET;
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9", "x-araf-origin-secret": SECRET }))).toBe("9.9.9.9");
    expect(resolveClientIp(mkReq({ "x-real-ip": "2001:db8::1", "x-araf-origin-secret": SECRET }))).toBe("2001:db8::1");
  });

  test("yanlış, eksik ya da farklı uzunlukta secret: x-real-ip taklidi yok sayılır", () => {
    process.env.ORIGIN_SHARED_SECRET = SECRET;
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9", "x-araf-origin-secret": "wrong" }))).toBe("66.241.125.182");
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9", "x-araf-origin-secret": SECRET + "x" }))).toBe("66.241.125.182");
    expect(resolveClientIp(mkReq({ "x-real-ip": "9.9.9.9" }))).toBe("66.241.125.182");
  });

  test("geçersiz x-real-ip yok sayılır", () => {
    process.env.ORIGIN_SHARED_SECRET = SECRET;
    for (const bad of ["not-an-ip", "1.2.3.4, 5.6.7.8", "999.1.1.1", ""]) {
      expect(resolveClientIp(mkReq({ "x-real-ip": bad, "x-araf-origin-secret": SECRET }))).toBe("66.241.125.182");
    }
    expect(resolveClientIp(mkReq({ "x-araf-origin-secret": SECRET }))).toBe("66.241.125.182");
  });
});

describe("rate limiter: farklı x-real-ip ayrı kova", () => {
  const prev = process.env.ORIGIN_SHARED_SECRET;
  afterEach(() => {
    jest.resetModules();
    if (prev === undefined) delete process.env.ORIGIN_SHARED_SECRET;
    else process.env.ORIGIN_SHARED_SECRET = prev;
  });

  function load() {
    let mod;
    jest.isolateModules(() => {
      jest.doMock("../../backend/scripts/config/redis", () => ({
        isReady: () => false,
        getRedisClient: () => ({ sendCommand: async () => "sha" }),
      }));
      jest.doMock("../../backend/scripts/models/User", () => ({ findOne: jest.fn() }));
      jest.doMock("../../backend/scripts/utils/logger", () => ({
        info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
      }));
      mod = require("../../backend/scripts/middleware/rateLimiter");
    });
    return mod;
  }

  const call = (limiter, req) => new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json() { resolve(this.statusCode); return this; },
    };
    limiter({ ip: "66.241.125.182", wallet: "0xabc", params: {}, query: {}, ...req }, res, () => resolve(200));
  });

  const h = (ip) => ({ headers: { "x-real-ip": ip, "x-araf-origin-secret": SECRET } });

  test("secret ile iki ziyaretçi ayrı kovada", async () => {
    process.env.ORIGIN_SHARED_SECRET = SECRET;
    const l = load();
    for (let i = 0; i < 10; i += 1) expect(await call(l.piiProfileLimiter, h("9.9.9.9"))).toBe(200);
    expect(await call(l.piiProfileLimiter, h("9.9.9.9"))).toBe(429);
    expect(await call(l.piiProfileLimiter, h("8.8.8.8"))).toBe(200);
  });

  test("secret yokken tek kova (bugünkü davranış)", async () => {
    delete process.env.ORIGIN_SHARED_SECRET;
    const l = load();
    for (let i = 0; i < 10; i += 1) expect(await call(l.piiProfileLimiter, h("9.9.9.9"))).toBe(200);
    expect(await call(l.piiProfileLimiter, h("8.8.8.8"))).toBe(429);
  });
});
