"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { initEnv } = require("../../scripts/init-env");

const REAL_ROOT = path.resolve(__dirname, "../..");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "init-env-"));
  for (const pkg of ["contracts", "backend", "frontend"]) {
    fs.mkdirSync(path.join(root, pkg));
    fs.copyFileSync(path.join(REAL_ROOT, pkg, ".env.example"), path.join(root, pkg, ".env.example"));
  }
  return root;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");

describe("scripts/init-env.js", () => {
  it("creates missing .env files with generated secrets and prints no secret", () => {
    const root = makeRoot();
    const logs = [];
    const res = initEnv({ root, log: (m) => logs.push(m) });
    expect(res.created.sort()).toEqual(["backend/.env", "contracts/.env", "frontend/.env"]);
    const env = read(root, "backend/.env");
    const jwt = env.match(/^JWT_SECRET=(.*)$/m)[1];
    const master = env.match(/^MASTER_ENCRYPTION_KEY=(.*)$/m)[1];
    expect(jwt).toMatch(/^[0-9a-f]{128}$/);
    expect(master).toMatch(/^[0-9a-f]{64}$/);
    expect(env).toMatch(/^RELAYER_PRIVATE_KEY=$/m);
    expect(logs.join("\n")).not.toContain(jwt);
    expect(logs.join("\n")).not.toContain(master);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never touches existing .env files; second run is a no-op", () => {
    const root = makeRoot();
    initEnv({ root, log: () => {} });
    const before = read(root, "backend/.env");
    const res = initEnv({ root, log: () => {} });
    expect(res.created).toEqual([]);
    expect(read(root, "backend/.env")).toBe(before);

    fs.writeFileSync(path.join(root, "frontend/.env"), "CUSTOM=1\n");
    initEnv({ root, log: () => {} });
    expect(read(root, "frontend/.env")).toBe("CUSTOM=1\n");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("warns on placeholders in an existing backend/.env and only replaces them with fixSecrets", () => {
    const root = makeRoot();
    const stale = "JWT_SECRET=short\nMASTER_ENCRYPTION_KEY=nothex\nOTHER=keep\n";
    fs.writeFileSync(path.join(root, "backend/.env"), stale);
    const logs = [];
    const res = initEnv({ root, log: (m) => logs.push(m) });
    expect(res.warned).toEqual(["backend/.env:JWT_SECRET", "backend/.env:MASTER_ENCRYPTION_KEY"]);
    expect(read(root, "backend/.env")).toBe(stale);

    initEnv({ root, fixSecrets: true, log: () => {} });
    const env = read(root, "backend/.env");
    expect(env).toMatch(/^JWT_SECRET=[0-9a-f]{128}$/m);
    expect(env).toMatch(/^MASTER_ENCRYPTION_KEY=[0-9a-f]{64}$/m);
    expect(env).toContain("OTHER=keep");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("flags JWT_SECRET like siwe.js does: known placeholder, low entropy, short; accepts a strong one", () => {
    const { findPlaceholders } = require("../../scripts/init-env");
    const master = "MASTER_ENCRYPTION_KEY=" + "ab12".repeat(16);
    const jwt = (v) => `JWT_SECRET=${v}\n${master}\n`;
    expect(findPlaceholders(jwt("changeme" + "x".repeat(60)))).toEqual(["JWT_SECRET"]);
    expect(findPlaceholders(jwt("a".repeat(80)))).toEqual(["JWT_SECRET"]);
    expect(findPlaceholders(jwt("abcd1234".repeat(4)))).toEqual(["JWT_SECRET"]);
    expect(findPlaceholders(jwt(require("crypto").randomBytes(64).toString("hex")))).toEqual([]);
  });
});
