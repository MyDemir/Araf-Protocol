"use strict";

// B1-06: watchdog gerçek ilerlemeye bağlı sinyal alır; takılmayı maskelemez; eski epoch döngüsü durur.

const mockRedis = { get: jest.fn(), set: jest.fn(), sIsMember: jest.fn().mockResolvedValue(0) };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/protocolConfig", () => ({ updateCachedFeeConfig: jest.fn(), updateCachedCooldownConfig: jest.fn(), updateCachedTokenConfig: jest.fn(), refreshProtocolConfig: jest.fn() }));
jest.mock("../../backend/scripts/models/Trade", () => ({}));
jest.mock("../../backend/scripts/models/Order", () => ({}));
jest.mock("../../backend/scripts/models/User", () => ({}));

const worker = require("../../backend/scripts/services/eventListener");

const T0 = 10_000_000;
const ev = (i) => ({ eventName: "X", transactionHash: `0x${i}`, index: i, blockNumber: 5, args: {} });

describe("B1-06 canlı event döngüsü ilerleme sinyali", () => {
  let now;
  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(T0);
    worker.contract = {};
    worker._stopRequested = false;
    worker._blockAcks.clear();
    worker._lastBlockSeenAt = T0;
    worker._isQuarantined = jest.fn().mockResolvedValue(false);
  });
  afterEach(() => { now.mockRestore(); worker.contract = null; });

  it("her sonuçlanan event (başarı ya da DLQ) watchdog sinyalini yeniler", async () => {
    worker._fetchRangeEvents = jest.fn().mockResolvedValue([ev(1), ev(2), ev(3)]);
    const seenAfter = [];
    // her event ~20 sn retry bekler; watchdog eşiği (75 sn) toplamda aşılır ama event başına aşılmaz
    worker._processEventWithRetry = jest.fn(async () => {
      seenAfter.push(Date.now() - worker._lastBlockSeenAt);
      now.mockReturnValue(Date.now() + 20_000);
      return false; // DLQ'ya yazıldı
    });
    await worker._pollLiveRange(5, 5);
    expect(seenAfter).toEqual([0, 0, 0]);
    expect(Date.now() - worker._lastBlockSeenAt).toBe(0);
  });

  it("sonuçlanmayan (askıda) event sinyal vermez: gerçek takılma maskelenmez", async () => {
    worker._fetchRangeEvents = jest.fn().mockResolvedValue([ev(1)]);
    let release;
    worker._processEventWithRetry = jest.fn(() => new Promise((r) => { release = r; }));
    const p = worker._pollLiveRange(5, 5);
    await new Promise((r) => setImmediate(r));
    now.mockReturnValue(T0 + 200_000);
    expect(worker._lastBlockSeenAt).toBe(T0); // askıdayken yenilenmedi
    release(true);
    await p;
    expect(worker._lastBlockSeenAt).toBe(T0 + 200_000); // yalnız sonuçlanınca
  });

  it("yeniden bağlanma (epoch değişimi) sonrası eski döngü sonraki event'i işlemez", async () => {
    worker._fetchRangeEvents = jest.fn().mockResolvedValue([ev(1), ev(2)]);
    worker._processEventWithRetry = jest.fn(async () => { worker._liveEpoch += 1; return true; });
    await worker._pollLiveRange(5, 5);
    expect(worker._processEventWithRetry).toHaveBeenCalledTimes(1);
  });
});
