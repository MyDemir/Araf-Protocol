"use strict";

jest.mock("../../backend/scripts/models/TerminalTradeStat", () => ({ updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock("../../backend/scripts/models/Trade", () => ({}));

const Counter = require("../../backend/scripts/models/TerminalTradeStat");
const { buildTerminalStatDoc, recordTerminalTradeStat } = require("../../backend/scripts/services/terminalStats");
const { runBackfillTerminalTradeStats, parseArgs } = require("../../backend/scripts/migrations/backfillTerminalTradeStats");

const trade = (id, status = "RESOLVED") => ({
  onchain_escrow_id: String(id),
  status,
  token_address: "0xABC",
  financials: { crypto_amount: "1000000", crypto_amount_num: 1000000, total_decayed: "5", total_decayed_num: 5, burned_amount: "7", burned_amount_num: 7 },
  timers: { locked_at: new Date("2026-01-01T00:00:00Z"), resolved_at: new Date("2026-01-01T02:00:00Z") },
});

describe("terminal trade counter (B23)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("builds a PII-free row with duration and decay+burned total", () => {
    const doc = buildTerminalStatDoc(trade(9, "BURNED"));
    expect(doc).toMatchObject({
      trade_key: "9", status: "BURNED", token_address: "0xabc", crypto_amount: "1000000",
      burned_amount: "12", burned_amount_num: 12, duration_ms: 2 * 3600 * 1000,
    });
  });

  it("ignores non-terminal trades and rows without identity", () => {
    expect(buildTerminalStatDoc(trade(1, "LOCKED"))).toBeNull();
    expect(buildTerminalStatDoc({ ...trade(1), onchain_escrow_id: null })).toBeNull();
  });

  it("records once per trade via $setOnInsert upsert on the unique trade_key (idempotent)", async () => {
    await recordTerminalTradeStat(trade(4));
    await recordTerminalTradeStat(trade(4));
    expect(Counter.updateOne).toHaveBeenCalledTimes(2);
    const [filter, update, opts] = Counter.updateOne.mock.calls[0];
    expect(filter).toEqual({ trade_key: "4" });
    expect(update).toHaveProperty("$setOnInsert");
    expect(update).not.toHaveProperty("$inc");
    expect(opts.upsert).toBe(true);
  });

  it("passes the transaction session through", async () => {
    const session = { id: "s" };
    await recordTerminalTradeStat(trade(5), { session });
    expect(Counter.updateOne.mock.calls[0][2].session).toBe(session);
  });
});

describe("backfillTerminalTradeStats migration", () => {
  function models(trades, existingKeys = []) {
    const stored = new Set(existingKeys);
    const TradeModel = {
      find: () => ({
        select: () => ({ lean: () => ({ cursor: () => (async function* () { for (const t of trades) yield t; })() }) }),
      }),
    };
    const CounterModel = {
      find: (q) => ({
        select: () => ({ lean: async () => q.trade_key.$in.filter((k) => stored.has(k)).map((k) => ({ trade_key: k })) }),
      }),
      bulkWrite: jest.fn(async (ops) => {
        let upsertedCount = 0;
        ops.forEach((o) => { const k = o.updateOne.filter.trade_key; if (!stored.has(k)) { stored.add(k); upsertedCount += 1; } });
        return { upsertedCount };
      }),
    };
    return { TradeModel, CounterModel, stored };
  }

  it("is dry-run by default", () => {
    expect(parseArgs([]).apply).toBe(false);
    expect(parseArgs(["--apply"]).apply).toBe(true);
  });

  it("dry-run reports without writing; apply fills missing rows; second apply is a no-op", async () => {
    const m = models([trade(1), trade(2, "CANCELED"), trade(3, "BURNED")], ["2"]);

    const dry = await runBackfillTerminalTradeStats({ TradeModel: m.TradeModel, CounterModel: m.CounterModel });
    expect(dry).toMatchObject({ dryRun: true, scanned: 3, wouldInsert: 2, alreadyPresent: 1, inserted: 0 });
    expect(m.CounterModel.bulkWrite).not.toHaveBeenCalled();

    const applied = await runBackfillTerminalTradeStats({ apply: true, TradeModel: m.TradeModel, CounterModel: m.CounterModel });
    expect(applied).toMatchObject({ dryRun: false, inserted: 2 });
    expect([...m.stored].sort()).toEqual(["1", "2", "3"]);

    const again = await runBackfillTerminalTradeStats({ apply: true, TradeModel: m.TradeModel, CounterModel: m.CounterModel });
    expect(again).toMatchObject({ wouldInsert: 0, inserted: 0, alreadyPresent: 3 });
  });

  it("upserts with $setOnInsert so existing rows are never overwritten", async () => {
    const m = models([trade(1)]);
    await runBackfillTerminalTradeStats({ apply: true, TradeModel: m.TradeModel, CounterModel: m.CounterModel });
    const op = m.CounterModel.bulkWrite.mock.calls[0][0][0].updateOne;
    expect(op.upsert).toBe(true);
    expect(op.update).toHaveProperty("$setOnInsert");
  });
});
