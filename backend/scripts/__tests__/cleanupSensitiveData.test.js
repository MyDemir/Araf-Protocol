"use strict";

jest.mock("../models/Trade", () => ({
  Trade: {
    updateMany: jest.fn(),
  },
}));

const { Trade } = require("../models/Trade");
const {
  runReceiptCleanup,
  runPIISnapshotCleanup,
} = require("../jobs/cleanupSensitiveData");

describe("cleanupSensitiveData jobs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("runReceiptCleanup clears expired encrypted receipt fields", async () => {
    Trade.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const now = new Date("2026-01-01T00:00:00.000Z");

    const modifiedCount = await runReceiptCleanup(now);
    expect(modifiedCount).toBe(2);
    expect(Trade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ "evidence.receipt_delete_at": { $lte: now } }),
      expect.objectContaining({
        $set: expect.objectContaining({
          "evidence.receipt_encrypted": null,
          "evidence.receipt_timestamp": null,
        }),
      })
    );
  });

  test("runPIISnapshotCleanup clears expired snapshot fields", async () => {
    Trade.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const now = new Date("2026-01-01T00:00:00.000Z");

    const modifiedCount = await runPIISnapshotCleanup(now);
    expect(modifiedCount).toBe(1);
    expect(Trade.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ "pii_snapshot.snapshot_delete_at": { $lte: now } }),
      expect.objectContaining({
        $set: expect.objectContaining({
          "pii_snapshot.maker_bankOwner_enc": null,
          "pii_snapshot.maker_iban_enc": null,
          "pii_snapshot.taker_bankOwner_enc": null,
        }),
      })
    );
  });
});

