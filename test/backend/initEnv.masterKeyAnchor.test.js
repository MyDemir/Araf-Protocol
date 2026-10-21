"use strict";

// K4-15: MASTER_ENCRYPTION_KEY yer tutucu regex'i `$` ile bitmeli (workflow ile tutarlı: tam 64 hex).
const { findPlaceholders } = require("../../scripts/init-env");

const jwt = "JWT_SECRET=" + require("crypto").randomBytes(64).toString("hex") + "\n";
const check = (v) => findPlaceholders(`${jwt}MASTER_ENCRYPTION_KEY=${v}\n`);

describe("init-env MASTER_ENCRYPTION_KEY validation (K4-15)", () => {
  it("accepts exactly 64 hex characters", () => {
    expect(check("ab12".repeat(16))).toEqual([]);
  });

  it("flags 65 hex characters", () => {
    expect(check("ab12".repeat(16) + "f")).toEqual(["MASTER_ENCRYPTION_KEY"]);
  });

  it("flags 64 hex followed by trailing garbage", () => {
    expect(check("ab12".repeat(16) + "zz")).toEqual(["MASTER_ENCRYPTION_KEY"]);
  });
});
