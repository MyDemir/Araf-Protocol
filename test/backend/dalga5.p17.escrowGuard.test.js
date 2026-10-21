"use strict";

// B4-12: ESCROW_REGISTRY_GUARD_MODE yoksa/geçersizse production'da fail-closed (enforce); diğer ortamlarda warn.

const { resolveMode, createEscrowRegistryGuard } = require("../../backend/scripts/services/escrowRegistryGuard");

const ADDR = "0x" + "a".repeat(40);
const OTHER = "0x" + "b".repeat(40);
const silent = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

describe("B4-12: resolveMode production varsayılanı", () => {
  it.each([
    [undefined, "production", "enforce", false],
    ["", "production", "enforce", false],
    ["enfroce", "production", "enforce", true],
    ["enforce", "production", "enforce", false],
    ["warn", "production", "warn", false], // açık seçim saygı görür
    ["off", "production", "off", false],
    [undefined, "development", "warn", false],
    [undefined, "test", "warn", false],
    [undefined, undefined, "warn", false],
    ["bogus", "development", "warn", true],
  ])("%j @ NODE_ENV=%s -> %s (invalid=%s)", (raw, nodeEnv, mode, invalid) => {
    const r = resolveMode(raw, nodeEnv);
    expect(r.mode).toBe(mode);
    expect(r.invalid).toBe(invalid);
  });

  it("production + env tanımsız + yanlış escrow adresi: bekçi engeller (503 yolu)", async () => {
    const g = createEscrowRegistryGuard({
      readActive: async () => ({ _id: "active", escrow_address: OTHER, chain_id: 84532, state: "ACTIVE" }),
      getEnv: () => ({ NODE_ENV: "production", ARAF_ESCROW_ADDRESS: ADDR, EXPECTED_CHAIN_ID: "84532" }),
      log: silent(),
    });
    await g.check();
    expect(g.getMode()).toBe("enforce");
    expect(g.isBlocking()).toBe(true);
    expect(g.getStatus().mode).toBe("enforce"); // /ready escrowRegistry.mode alanı korunur
  });

  it("geliştirmede aynı durum yalnız uyarır (mevcut davranış)", async () => {
    const g = createEscrowRegistryGuard({
      readActive: async () => ({ _id: "active", escrow_address: OTHER, chain_id: 84532, state: "ACTIVE" }),
      getEnv: () => ({ NODE_ENV: "development", ARAF_ESCROW_ADDRESS: ADDR, EXPECTED_CHAIN_ID: "84532" }),
      log: silent(),
    });
    await g.check();
    expect(g.getMode()).toBe("warn");
    expect(g.isBlocking()).toBe(false);
  });
});
