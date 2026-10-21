"use strict";

// K4-16 / K4-17: Dockerfile, .dockerignore ve fly.toml statik korumaları (docker/fly çalıştırılmaz).
const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");

describe("backend Dockerfile hardening (K4-16)", () => {
  const src = read("Dockerfile");

  it("does not duplicate the app in a chown -R layer and keeps code root-owned", () => {
    expect(src).not.toMatch(/chown\s+-R/);
    expect(src).not.toMatch(/COPY\s+--chown=nodeapp[^\n]*\.\s+\./);
  });

  it("creates the user before copying code and only chowns the log dir", () => {
    expect(src.indexOf("adduser")).toBeGreaterThan(-1);
    expect(src.indexOf("adduser")).toBeLessThan(src.indexOf("COPY . ."));
    expect(src).toMatch(/chown nodeapp:nodeapp \/usr\/src\/app\/logs/);
    expect(src.indexOf("USER nodeapp")).toBeGreaterThan(src.indexOf("COPY . ."));
  });

  it(".dockerignore keeps secrets, tests tooling and fly.toml out of the image", () => {
    const ign = read(".dockerignore").split("\n").map((l) => l.trim());
    for (const entry of [".env*", "node_modules", "fly.toml", "jest.config.*", "eslint.config.*", "coverage/", ".claude/"]) {
      expect(ign).toContain(entry);
    }
  });
});

describe("backend fly.toml shutdown and deploy settings (K4-17)", () => {
  const toml = read("fly.toml");
  const topLevel = toml.split(/^\[/m)[0];

  it("sets kill_signal and a kill_timeout above the app force-exit timeout (8s)", () => {
    expect(topLevel).toMatch(/^kill_signal\s*=\s*"SIGTERM"/m);
    const m = topLevel.match(/^kill_timeout\s*=\s*"?(\d+)s?"?/m);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(8);
  });

  it("declares an explicit [deploy] strategy", () => {
    expect(toml).toMatch(/^\[deploy\]\s*\n\s*strategy\s*=\s*"rolling"/m);
  });
});
