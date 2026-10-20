"use strict";

const fs = require("fs");
const path = require("path");

describe("deploy hardening static guards", () => {
  it("backend Dockerfile uses Node 22 LTS alpine and non-root user", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "Dockerfile"), "utf8");
    expect(src).toContain("FROM node:22-alpine");
    expect(src).not.toContain("FROM node:18-alpine");
    expect(src).toContain("USER nodeapp");
    expect(src).toContain("npm ci --omit=dev");
    expect(src).not.toContain("npm install --omit=dev");
  });

  it("deployment guide mentions readiness and env policy", () => {
    const en = fs.readFileSync(path.resolve(process.cwd(), "../docs/EN/DEPLOYMENT_GUIDE.md"), "utf8");
    expect(en).toContain("/ready");
    expect(en).toContain("VITE_*");
    expect(en).toContain("REDIS_TLS_SKIP_VERIFY=true");
  });

  it("escrow registry first-install adopt step runs after contract deploy + checkpoint reset and before the health check", () => {
    const wf = fs.readFileSync(path.resolve(process.cwd(), "../.github/workflows/deploy-base-sepolia.yml"), "utf8");
    const at = (needle) => wf.indexOf(`- name: ${needle}`);
    const deploy = at("Deploy contracts to Base Sepolia");
    const flyDeploy = at("Deploy backend to Fly");
    const reset = at("Reset worker checkpoint for new deployment (first install)");
    const registry = at("Write active escrow registry (first install)");
    const health = at("Check backend health");
    for (const n of [deploy, flyDeploy, reset, registry, health]) expect(n).toBeGreaterThan(-1);
    expect(deploy).toBeLessThan(flyDeploy);
    expect(reset).toBeLessThan(registry);
    expect(registry).toBeLessThan(health);
    const step = wf.slice(registry, health);
    expect(step).toContain("escrow-registry.js --adopt --apply");
    expect(step).not.toContain("--force-switch");
    expect(step).toContain("MONGODB_URI: ${{ secrets.MONGODB_URI }}");
    // runtime deploy escrow'u değiştirmez: registry yazmaz
    const runtime = fs.readFileSync(path.resolve(process.cwd(), "../.github/workflows/deploy-runtime-base-sepolia.yml"), "utf8");
    expect(runtime).not.toContain("escrow-registry");
  });

  it("escrow-registry-adopt workflow is manual, dry-run by default, never force-switches", () => {
    const wf = fs.readFileSync(path.resolve(process.cwd(), "../.github/workflows/escrow-registry-adopt.yml"), "utf8");
    expect(wf).toContain("workflow_dispatch:");
    expect(wf).toMatch(/dry_run:[\s\S]*?default: true/);
    expect(wf).toContain("escrow-registry.js --adopt");
    expect(wf.replace(/#.*$/gm, "")).not.toContain("--force-switch");
    expect(wf).toContain("MONGODB_URI: ${{ secrets.MONGODB_URI }}");
  });
});
