"use strict";

const fs = require("fs");
const path = require("path");

describe("backend route mount consistency", () => {
  it("app.js mounts all UX-critical routes under /api", () => {
    const appSource = fs.readFileSync(path.join(__dirname, "../../backend/scripts/app.js"), "utf8");

    // Mounts now come from the single-source list (routes/mounts.js), iterated by app.js.
    expect(appSource).toContain("for (const { path: mountPath, file } of ROUTE_MOUNTS)");
    const { ROUTE_MOUNTS } = require("../../backend/scripts/routes/mounts");
    const mounted = ROUTE_MOUNTS.map((m) => m.path);
    expect(mounted[0]).toBe("/api/logs");
    [
      "/api/logs", "/api/auth", "/api/orders", "/api/trades", "/api/pii", "/api/stats",
      "/api/receipts", "/api/reference-rates",
    ].forEach((mount) => expect(mounted).toContain(mount));

    // /api/listings is a deprecated compatibility alias when imported directly,
    // not part of the canonical V3 app.js mount surface.
    expect(appSource).not.toContain('app.use("/api/listings"');
  });
});
