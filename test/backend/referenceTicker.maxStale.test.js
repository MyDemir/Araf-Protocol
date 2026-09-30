"use strict";

jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(), isReady: jest.fn(() => false) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const ticker = require("../../backend/scripts/services/referenceTicker");

const NOW = Date.parse("2026-09-30T12:00:00.000Z");
const item = (symbol, hoursAgo) => ({
  symbol, base: symbol.split("/")[0], quote: symbol.split("/")[1], rate: 1, source: "x",
  sourceKind: "CRYPTO_EXCHANGE_REFERENCE", derived: false, stale: false,
  updatedAt: new Date(NOW - hoursAgo * 3600_000).toISOString(),
});

describe("referenceTicker staleness cap", () => {
  it("defaults to 24 hours", () => {
    expect(ticker.MAX_STALE_SECONDS).toBe(86400);
  });

  it("keeps a stale row younger than the cap, flagged stale, with its original updatedAt", () => {
    const lastGood = { generatedAt: new Date(NOW).toISOString(), items: [item("BTC/USDT", 2)] };
    const { items } = ticker._mergeWithLastGood([item("ETH/USDT", 0)], lastGood, NOW);
    const btc = items.find((i) => i.symbol === "BTC/USDT");
    expect(btc.stale).toBe(true);
    expect(btc.updatedAt).toBe(lastGood.items[0].updatedAt);
  });

  it("drops a stale row older than the cap even when lastGood was itself just refreshed", () => {
    // lastGood.generatedAt is recent (TTL renewed by another fresh row) but the row's own updatedAt is old
    const lastGood = { generatedAt: new Date(NOW).toISOString(), items: [item("BTC/USDT", 25), item("USD/TRY", 23)] };
    const { items, freshCount } = ticker._mergeWithLastGood([item("ETH/USDT", 0)], lastGood, NOW);
    expect(freshCount).toBe(1);
    expect(items.map((i) => i.symbol)).toEqual(["ETH/USDT", "USD/TRY"]);
  });

  it("drops rows without a parseable timestamp", () => {
    const bad = { ...item("BTC/USDT", 1), updatedAt: undefined };
    const { items } = ticker._mergeWithLastGood([item("ETH/USDT", 0)], { items: [bad] }, NOW);
    expect(items.map((i) => i.symbol)).toEqual(["ETH/USDT"]);
  });
});
