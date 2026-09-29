"use strict";
const fs = require("fs");
const path = require("path");

describe("rewards current epoch endpoint", () => {
  it("current_epoch_endpoint_marks_wall_clock_estimate_non_authoritative_or_uses_chain", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../backend/scripts/routes/rewards.js"), "utf8");
    expect(source).toContain('source: "WALL_CLOCK_ESTIMATE_NOT_AUTHORITY"');
  });

  it("uses the contract's 30-day epoch for the wall-clock estimate", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../backend/scripts/routes/rewards.js"), "utf8");
    expect(source).toContain("const REWARDS_EPOCH_SECONDS = 30 * 24 * 3600;");
    expect(source).not.toContain("7 * 24 * 3600");
  });
});
