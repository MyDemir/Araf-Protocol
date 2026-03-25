"use strict";

const mockRedis = {
  lLen: jest.fn(),
  lRange: jest.fn(),
  rPush: jest.fn(),
  lPush: jest.fn(),
  lTrim: jest.fn(),
  expire: jest.fn(),
  multi: jest.fn(),
};

jest.mock("../config/redis", () => ({
  getRedisClient: () => mockRedis,
}));

const { processDLQ } = require("../services/dlqProcessor");

describe("DLQ processor retry/requeue/quarantine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("requeues failed entry with incremented attempt", async () => {
    const entry = {
      eventName: "EscrowReleased",
      txHash: "0xabc",
      blockNumber: 10,
      attempt: 1,
    };
    mockRedis.lLen.mockResolvedValue(1);
    mockRedis.lRange.mockResolvedValue([JSON.stringify(entry)]);

    await processDLQ({ retryHandler: async () => false });

    expect(mockRedis.rPush).toHaveBeenCalledWith(
      "worker:dlq",
      expect.stringContaining("\"attempt\":2")
    );
    expect(mockRedis.lTrim).toHaveBeenCalledWith("worker:dlq", 1, -1);
  });

  test("quarantines entry when max retries reached", async () => {
    const entry = {
      eventName: "EscrowReleased",
      txHash: "0xdef",
      blockNumber: 11,
      attempt: 4,
    };
    mockRedis.lLen.mockResolvedValue(1);
    mockRedis.lRange.mockResolvedValue([JSON.stringify(entry)]);

    await processDLQ({ retryHandler: async () => false });

    expect(mockRedis.lPush).toHaveBeenCalledWith(
      "worker:dlq:archive",
      expect.stringContaining("\"quarantined_at\"")
    );
    expect(mockRedis.rPush).not.toHaveBeenCalled();
  });
});

