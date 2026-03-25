"use strict";

const fs = require("fs");
const path = require("path");

describe("Auth cookie/docs alignment", () => {
  test("auth route and API docs declare SameSite=Lax", () => {
    const authRoute = fs.readFileSync(path.join(__dirname, "../routes/auth.js"), "utf8");
    const apiEn = fs.readFileSync(path.join(__dirname, "../../..", "docs/EN/API.md"), "utf8");
    const apiTr = fs.readFileSync(path.join(__dirname, "../../..", "docs/TR/API.md"), "utf8");

    expect(authRoute).toContain('sameSite: "lax"');
    expect(apiEn).toContain("SameSite=Lax");
    expect(apiTr).toContain("SameSite=Lax");
    expect(apiEn).not.toContain("SameSite=Strict");
    expect(apiTr).not.toContain("SameSite=Strict");
  });
});
