"use strict";

const { ethers } = require("ethers");

const mockRedis = { get: jest.fn(), set: jest.fn(), rPush: jest.fn(), lLen: jest.fn().mockResolvedValue(0) };
jest.mock("../../backend/scripts/config/redis", () => ({ getRedisClient: jest.fn(() => mockRedis) }));
jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock("../../backend/scripts/services/expectedChain", () => ({ assertProviderExpectedChainOrThrow: jest.fn() }));

const ESCROW = "0x" + "a1".repeat(20);
const VAULT = "0x" + "b2".repeat(20);
const REWARDS = "0x" + "c3".repeat(20);
const TX = "0x" + "11".repeat(32);

describe("eventListener reads a block range with a single eth_getLogs", () => {
  let worker;
  let iface;

  function log(address, name, args, index, blockNumber = 10) {
    const enc = iface.encodeEventLog(iface.getEvent(name), args);
    return {
      address, topics: enc.topics, data: enc.data, index, blockNumber,
      transactionHash: TX, blockHash: "0x" + "22".repeat(32), transactionIndex: 0, removed: false,
    };
  }

  beforeEach(() => {
    jest.resetModules();
    worker = require("../../backend/scripts/services/eventListener");
    const abi = worker._ARAF_ABI_FOR_TESTS;
    iface = new ethers.Interface(abi);
    worker.contract = new ethers.Contract(ESCROW, abi);
    worker.vaultContract = new ethers.Contract(VAULT, abi);
    worker.rewardsContract = new ethers.Contract(REWARDS, abi);
  });

  it("issues one getLogs for all three contracts and decodes events in chain order", async () => {
    const wallet = "0x" + "d4".repeat(20);
    worker.provider = {
      getLogs: jest.fn().mockResolvedValue([
        log(ESCROW, "WalletRegistered", [wallet, 5], 3),
        log(ESCROW, "WalletRegistered", [wallet, 6], 1),
      ]),
    };

    const events = await worker._fetchRangeEvents(1, 1000);

    expect(worker.provider.getLogs).toHaveBeenCalledTimes(1);
    const filter = worker.provider.getLogs.mock.calls[0][0];
    expect(filter).toMatchObject({ fromBlock: 1, toBlock: 1000 });
    expect(filter.address).toEqual([ESCROW, VAULT, REWARDS]);
    expect(events.map((e) => e.eventName)).toEqual(["WalletRegistered", "WalletRegistered"]);
    // [TR] Aynı tx'teki iki event farklı idempotency anahtarı alır (logIndex hatası).
    // [EN] Two events in one tx get distinct idempotency keys (the logIndex bug).
    expect(events.map((e) => worker._getEventId(e))).toEqual([`${TX}:1`, `${TX}:3`]);
  });

  it("ignores a watched event name emitted by the wrong contract and unknown topics", async () => {
    const wallet = "0x" + "d4".repeat(20);
    worker.provider = {
      getLogs: jest.fn().mockResolvedValue([
        log(VAULT, "WalletRegistered", [wallet, 5], 0),
        { address: ESCROW, topics: ["0x" + "ee".repeat(32)], data: "0x", index: 1, blockNumber: 10, transactionHash: TX },
      ]),
    };
    expect(await worker._fetchRangeEvents(1, 10)).toEqual([]);
  });

  it("replay keeps the checkpoint when the range cannot be read", async () => {
    mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce("0");
    worker.provider = { getBlockNumber: jest.fn().mockResolvedValue(10), getLogs: jest.fn().mockRejectedValue(new Error("rpc down")) };
    await worker._replayMissedEvents();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
