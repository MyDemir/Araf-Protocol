"use strict";

const {
  resolveMode,
  evaluateRegistry,
  createEscrowRegistryGuard,
} = require("../../backend/scripts/services/escrowRegistryGuard");

const ADDR = "0x" + "a".repeat(40);
const OTHER = "0x" + "b".repeat(40);
const baseEnv = { ARAF_ESCROW_ADDRESS: ADDR.toUpperCase().replace("0X", "0x"), EXPECTED_CHAIN_ID: "84532" };
const goodDoc = { _id: "active", escrow_address: ADDR, chain_id: 84532, deploy_block: 10, state: "ACTIVE" };

const silent = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

describe("resolveMode", () => {
  it.each([
    ["off", "off", false],
    ["warn", "warn", false],
    ["enforce", "enforce", false],
    [" ENFORCE ", "enforce", false],
    ["", "warn", false],
    [undefined, "warn", false],
    ["enfroce", "warn", true],
    ["on", "warn", true],
  ])("%j -> %s (invalid=%s)", (raw, mode, invalid) => {
    const r = resolveMode(raw);
    expect(r.mode).toBe(mode);
    expect(r.invalid).toBe(invalid);
  });

  it("invalid value logs a warning and falls back to warn", async () => {
    const log = silent();
    const g = createEscrowRegistryGuard({ readActive: async () => goodDoc, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "bogus" }), log });
    await g.check();
    expect(g.getMode()).toBe("warn");
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("geçersiz"));
  });
});

describe("evaluateRegistry (5 states)", () => {
  it("match -> ok", () => {
    expect(evaluateRegistry(goodDoc, baseEnv)).toEqual({ ok: true, reason: null });
  });
  it("no document -> registry_missing", () => {
    expect(evaluateRegistry(null, baseEnv).reason).toBe("registry_missing");
  });
  it("different address -> escrow_mismatch", () => {
    expect(evaluateRegistry({ ...goodDoc, escrow_address: OTHER }, baseEnv).reason).toBe("escrow_mismatch");
  });
  it("env address missing -> escrow_mismatch", () => {
    expect(evaluateRegistry(goodDoc, { EXPECTED_CHAIN_ID: "84532" }).reason).toBe("escrow_mismatch");
  });
  it("different chain -> chain_mismatch", () => {
    expect(evaluateRegistry({ ...goodDoc, chain_id: 8453 }, baseEnv).reason).toBe("chain_mismatch");
  });
  it("ROTATING -> rotating", () => {
    expect(evaluateRegistry({ ...goodDoc, state: "ROTATING" }, baseEnv).reason).toBe("rotating");
  });
  it("unknown state is not ACTIVE (fail-closed)", () => {
    expect(evaluateRegistry({ ...goodDoc, state: "X" }, baseEnv).ok).toBe(false);
  });
});

const CASES = [
  ["match", goodDoc, true, null],
  ["missing", null, false, "registry_missing"],
  ["address", { ...goodDoc, escrow_address: OTHER }, false, "escrow_mismatch"],
  ["chain", { ...goodDoc, chain_id: 1 }, false, "chain_mismatch"],
  ["rotating", { ...goodDoc, state: "ROTATING" }, false, "rotating"],
];

describe("guard state x mode", () => {
  it.each(CASES)("warn / %s: never blocks, status still reported", async (_n, doc, ok, reason) => {
    const g = createEscrowRegistryGuard({ readActive: async () => doc, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "warn" }), log: silent() });
    await g.check();
    expect(g.isBlocking()).toBe(false);
    expect(g.getBlockReason()).toBeNull();
    expect(g.getStatus()).toMatchObject({ mode: "warn", ok, reason, checked: true });
  });

  it.each(CASES)("enforce / %s: blocks iff incompatible", async (_n, doc, ok, reason) => {
    const g = createEscrowRegistryGuard({ readActive: async () => doc, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "enforce" }), log: silent() });
    await g.check();
    expect(g.isBlocking()).toBe(!ok);
    expect(g.getBlockReason()).toBe(reason);
  });

  it("default mode (env unset) is warn", async () => {
    const g = createEscrowRegistryGuard({ readActive: async () => null, getEnv: () => baseEnv, log: silent() });
    await g.check();
    expect(g.getMode()).toBe("warn");
    expect(g.isBlocking()).toBe(false);
  });

  it("off: never reads the registry and never blocks", async () => {
    const readActive = jest.fn(async () => null);
    const g = createEscrowRegistryGuard({ readActive, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "off" }), log: silent() });
    await g.check();
    expect(readActive).not.toHaveBeenCalled();
    expect(g.isBlocking()).toBe(false);
  });

  it("read failure: enforce fails closed (registry_unreadable), warn only logs", async () => {
    const boom = async () => { throw new Error("mongo down"); };
    const enforce = createEscrowRegistryGuard({ readActive: boom, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "enforce" }), log: silent() });
    await enforce.check();
    expect(enforce.isBlocking()).toBe(true);
    expect(enforce.getBlockReason()).toBe("registry_unreadable");

    const log = silent();
    const warn = createEscrowRegistryGuard({ readActive: boom, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "warn" }), log });
    await warn.check();
    expect(warn.isBlocking()).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });

  it("logs once, and again only when the status changes", async () => {
    const log = silent();
    let doc = null;
    const g = createEscrowRegistryGuard({ readActive: async () => doc, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "warn" }), log });
    await g.check();
    await g.check();
    await g.check();
    expect(log.warn).toHaveBeenCalledTimes(1);
    doc = goodDoc;
    await g.check();
    expect(log.info).toHaveBeenCalledTimes(1);
  });

  it("onChange fires on block/unblock transitions only", async () => {
    let doc = null;
    const onChange = jest.fn();
    const g = createEscrowRegistryGuard({ readActive: async () => doc, getEnv: () => ({ ...baseEnv, ESCROW_REGISTRY_GUARD_MODE: "enforce" }), log: silent(), onChange });
    await g.check();
    await g.check();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ blocking: true, reason: "registry_missing" });
    doc = goodDoc;
    await g.check();
    expect(onChange).toHaveBeenLastCalledWith({ blocking: false, reason: null });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("only reads (findById) and never writes", async () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "../../backend/scripts/services/escrowRegistryGuard.js"), "utf8");
    expect(src).not.toMatch(/\.(updateOne|updateMany|findOneAndUpdate|insertOne|insertMany|deleteOne|deleteMany|create|save|replaceOne|bulkWrite|drop)\(/);
  });
});

describe("registry model is not touched outside the guard (backend read-only)", () => {
  it("no route/job/other service references EscrowRegistry", () => {
    const fs = require("fs");
    const path = require("path");
    const root = path.join(__dirname, "../../backend/scripts");
    const hits = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".js") && /models\/EscrowRegistry|collection:\s*["']escrow_registry["']/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits.sort()).toEqual(["models/EscrowRegistry.js", "services/escrowRegistryGuard.js"].sort());
  });
});
