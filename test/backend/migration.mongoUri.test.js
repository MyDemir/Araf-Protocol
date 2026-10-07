"use strict";

const fs = require("fs");
const path = require("path");
const { resolveMongoUri } = require("../../backend/scripts/migrations/_mongoUri");

describe("migration mongo URI resolution", () => {
  it("prefers MONGODB_URI without warning", () => {
    const warn = jest.fn();
    expect(resolveMongoUri({ MONGODB_URI: "a", MONGO_URI: "b" }, warn)).toBe("a");
    expect(warn).not.toHaveBeenCalled();
  });
  it("falls back to MONGO_URI with a deprecation warning", () => {
    const warn = jest.fn();
    expect(resolveMongoUri({ MONGO_URI: "b" }, warn)).toBe("b");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("MONGO_URI kullanımdan kalktı, MONGODB_URI kullanın"));
  });
  it("throws when neither is set", () => {
    expect(() => resolveMongoUri({}, jest.fn())).toThrow(/MONGODB_URI/);
  });
  it("all three migrations use the shared helper", () => {
    for (const f of ["normalizeIdentityFields", "dedupeRevenueEvents", "backfillTerminalTradeStats"]) {
      const src = fs.readFileSync(path.resolve(__dirname, `../../backend/scripts/migrations/${f}.js`), "utf8");
      expect(src).toContain("resolveMongoUri");
      expect(src).not.toMatch(/process\.env\.MONGO_URI/);
    }
  });
});
