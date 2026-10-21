"use strict";

// K4-16 kalanı: temel imaj etiketi + index digest ile sabitlenir (tekrarlanabilir derleme).
const fs = require("fs");
const path = require("path");

describe("backend Dockerfile temel imaj sabitleme", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../backend/Dockerfile"), "utf8");

  it("FROM node:22-alpine@sha256:<64 hex> biçiminde", () => {
    expect(src).toMatch(/^FROM node:22-alpine@sha256:[0-9a-f]{64}\s*$/m);
  });
});
