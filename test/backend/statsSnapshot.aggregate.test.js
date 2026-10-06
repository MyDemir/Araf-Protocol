"use strict";

// B23: cumulative string volumes come from $group aggregates; no full-collection find().
// Terminal cumulatives are read from the permanent TerminalTradeStat counter, never from Trade (TTL'd).

const { Types } = require("mongoose");

const dec = (s) => Types.Decimal128.fromString(s);

function load({ tradeTotals = {}, counterTotals = {}, tradeCount = 3, counterCount = 10 } = {}) {
  const Trade = {
    find: jest.fn(() => { throw new Error("Trade.find must not be used (loads every trade into memory)"); }),
    countDocuments: jest.fn().mockResolvedValue(tradeCount),
    aggregate: jest.fn(async (pipeline) => {
      const group = pipeline.find((st) => st.$group)?.$group || {};
      if (group._id === null && group.total) return [{ _id: null, total: dec(tradeTotals.live || "7") }];
      return [];
    }),
  };
  const Counter = {
    countDocuments: jest.fn().mockResolvedValue(counterCount),
    aggregate: jest.fn(async (pipeline) => {
      const group = pipeline.find((st) => st.$group)?.$group || {};
      const match = pipeline[0].$match || {};
      if (group._id === null && group.total) {
        if (match.status === "RESOLVED") return [{ _id: null, total: dec(counterTotals.resolved || "123456789012345678901234567890") }];
        if (match.status === "BURNED") return [{ _id: null, total: dec(counterTotals.burned || "42") }];
        return [{ _id: null, total: dec(counterTotals.all || "999999999999999999999999") }];
      }
      if (group._id === null && group.count !== undefined || group.count) {
        return [{ _id: null, totalVolumeApprox: 5_000_000, count: 2, totalDurationMs: 7_200_000, durationKnownCount: 2 }];
      }
      return [];
    }),
  };
  const Order = { countDocuments: jest.fn().mockResolvedValue(0) };
  let mod;
  jest.isolateModules(() => {
    jest.doMock("../../backend/scripts/models/Trade", () => Trade);
    jest.doMock("../../backend/scripts/models/TerminalTradeStat", () => Counter);
    jest.doMock("../../backend/scripts/models/Order", () => Order);
    jest.doMock("../../backend/scripts/models/HistoricalStat", () => ({}));
    jest.doMock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    jest.doMock("../../backend/scripts/services/protocolConfig", () => ({ getConfig: () => ({ tokenMap: {} }) }));
    mod = require("../../backend/scripts/jobs/statsSnapshot");
  });
  return { mod, Trade, Counter };
}

describe("statsSnapshot aggregate sums (B23)", () => {
  afterEach(() => jest.resetModules());

  test("string volumes are exact beyond 2^53 and never loaded via Trade.find", async () => {
    const { mod, Trade } = load();
    const stats = await mod.computeCurrentStats();
    expect(Trade.find).not.toHaveBeenCalled();
    expect(stats.total_volume_usdt_str).toBe("123456789012345678901234567890");
    // executed = all terminal (counter) + live LOCKED/PAID/CHALLENGED (Trade)
    expect(stats.executed_volume_usdt_str).toBe("1000000000000000000000006");
    expect(stats.burned_bonds_usdt_str).toBe("42");
  });

  test("terminal cumulatives come from the permanent counter and Trade is read only for non-terminal rows", async () => {
    const { mod, Trade, Counter } = load({ tradeCount: 3, counterCount: 10 });
    const stats = await mod.computeCurrentStats();

    // child_trade_count = live Trade rows + permanent counter rows (no double counting of not-yet-expired terminals)
    expect(Trade.countDocuments).toHaveBeenCalledWith({ status: { $nin: ["RESOLVED", "CANCELED", "BURNED"] } });
    expect(stats.child_trade_count).toBe(13);
    expect(stats.completed_trades).toBe(2);
    expect(stats.avg_trade_hours).toBe(1);

    // no Trade pipeline may match terminal statuses any more
    const tradePipelines = Trade.aggregate.mock.calls.map((c) => JSON.stringify(c[0]));
    tradePipelines.forEach((p) => {
      expect(p).not.toContain('"status":"RESOLVED"');
      expect(p).not.toContain('"status":"BURNED"');
      expect(p).not.toMatch(/"\$in":\[[^\]]*"(RESOLVED|CANCELED|BURNED)"/);
    });
    expect(Counter.aggregate).toHaveBeenCalled();
  });

  test("stats do not go backwards when Trade rows were TTL-deleted (counter still holds them)", async () => {
    // Trade collection is empty (all terminal trades expired) but the counter retains them.
    const { mod } = load({ tradeCount: 0, tradeTotals: { live: "0" }, counterCount: 10 });
    const stats = await mod.computeCurrentStats();
    expect(stats.completed_trades).toBe(2);
    expect(stats.child_trade_count).toBe(10);
    expect(stats.total_volume_usdt_str).toBe("123456789012345678901234567890");
  });

  test("burned sums come from the counter's pre-summed decay+burned string", async () => {
    const { mod, Counter } = load();
    await mod.computeCurrentStats();
    const pipelines = Counter.aggregate.mock.calls.map((c) => c[0]);
    const burned = pipelines.find((p) => p[0].$match?.status === "BURNED");
    const expr = burned[1].$group.total.$sum;
    expect(expr.$convert).toMatchObject({ input: "$burned_amount", to: "decimal", onError: 0, onNull: 0 });
  });

  test("avg_trade_hours uses only rows with a known duration (duration_ms > 0)", async () => {
    const { mod, Counter } = load();
    await mod.computeCurrentStats();
    const resolvedPipeline = Counter.aggregate.mock.calls.map((c) => c[0]).find((p) => p[1]?.$group?.durationKnownCount);
    expect(resolvedPipeline[1].$group.durationKnownCount).toEqual({ $sum: { $cond: [{ $gt: ["$duration_ms", 0] }, 1, 0] } });

    // 3 resolved, only 1 with a known 3h duration -> average 3h (not 1h)
    Counter.aggregate.mockImplementation(async (pipeline) => {
      const group = pipeline.find((st) => st.$group)?.$group || {};
      if (group.durationKnownCount) return [{ _id: null, totalVolumeApprox: 0, count: 3, totalDurationMs: 3 * 3600_000, durationKnownCount: 1 }];
      if (group._id === null && group.total) return [{ _id: null, total: dec("0") }];
      return [];
    });
    expect((await mod.computeCurrentStats()).avg_trade_hours).toBe(3);

    // no known durations at all -> null, not 0
    Counter.aggregate.mockImplementation(async (pipeline) => {
      const group = pipeline.find((st) => st.$group)?.$group || {};
      if (group.durationKnownCount) return [{ _id: null, totalVolumeApprox: 0, count: 2, totalDurationMs: 0, durationKnownCount: 0 }];
      if (group._id === null && group.total) return [{ _id: null, total: dec("0") }];
      return [];
    });
    expect((await mod.computeCurrentStats()).avg_trade_hours).toBeNull();
  });

  test("decimal128 text normalisation", () => {
    const { mod } = load();
    expect(mod._decimal128ToIntString("123")).toBe("123");
    expect(mod._decimal128ToIntString("1.5E+3")).toBe("1500");
    expect(mod._decimal128ToIntString("12E+2")).toBe("1200");
    expect(mod._decimal128ToIntString("-7")).toBe("-7");
    expect(mod._decimal128ToIntString(null)).toBe("0");
    expect(mod._decimal128ToIntString("garbage")).toBe("0");
  });
});
