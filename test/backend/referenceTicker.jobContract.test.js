"use strict";

const { didScheduledJobSucceed } = require("../../backend/scripts/utils/schedulerSuccess");

function loadService() {
  let service;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/config/redis", () => ({ isReady: () => false, getRedisClient: jest.fn() }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    service = require("../../backend/scripts/services/referenceTicker");
  });
  return service;
}

function mockFetch() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes("frankfurter")) {
      return { ok: true, json: async () => ({ rates: { TRY: 35, EUR: 0.9, GBP: 0.8 } }) };
    }
    return { ok: true, json: async () => ({ trades: [{ price: "2" }] }) };
  });
}

describe("referenceTicker scheduler job contract", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  test("success => success:true and satisfies the scheduler contract", async () => {
    const svc = loadService();
    mockFetch();
    const r = await svc.runReferenceTickerJob();
    expect(r.success).toBe(true);
    expect(didScheduledJobSucceed(r)).toBe(true);
  });

  test("refresh payload shape is unchanged (no success key)", async () => {
    const svc = loadService();
    mockFetch();
    const payload = await svc.refreshReferenceTicker();
    expect(Object.keys(payload).sort()).toEqual(
      ["canAffectSettlement", "generatedAt", "informationalOnly", "items", "nonAuthoritative"]
    );
    expect(payload.success).toBeUndefined();
  });

  test("failure => success:false, short masked error", async () => {
    const svc = loadService();
    mockFetch();
    const spy = jest.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
      throw new Error("boom https://user:pw@host.example.com/x?k=secret");
    });
    let r;
    try {
      r = await svc.runReferenceTickerJob();
    } finally {
      spy.mockRestore();
    }
    expect(r.success).toBe(false);
    expect(r.error).toContain("boom");
    expect(r.error).not.toMatch(/https?:|pw@|secret/);
    expect(didScheduledJobSucceed(r)).toBe(false);
  });
});
