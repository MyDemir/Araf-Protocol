"use strict";

// B4-16: --apply silmeden önce silinecek belgeleri JSON dosyasına yedekleyebilmeli (--backup=<dosya>).

const fs = require("fs");
const os = require("os");
const path = require("path");
const { runDedupeRevenueEvents, parseArgs } = require("../../backend/scripts/migrations/dedupeRevenueEvents");

const base = { token: "0xaaa", amount: "100", kind: 0, trade_id: "5", source: "ESCROW_REVENUE" };
const escrowRow = (id) => ({ _id: id, tx_hash: "0x1", log_index: 1, ...base, reward_share: null, treasury_share: null });
const vaultRow = (id) => ({ _id: id, tx_hash: "0x1", log_index: 2, ...base, reward_share: "40", treasury_share: "60" });

function fakeModel(initial, { events } = {}) {
  let rows = [...initial];
  return {
    rows: () => rows,
    aggregate: jest.fn(async () => [{ _id: "0x1", n: rows.length }]),
    find: jest.fn((q) => ({ lean: async () => rows.filter((r) => r.tx_hash === q.tx_hash) })),
    deleteMany: jest.fn(async (q) => {
      if (events) events.push("delete");
      const ids = new Set(q._id.$in);
      const before = rows.length;
      rows = rows.filter((r) => !ids.has(r._id));
      return { deletedCount: before - rows.length };
    }),
  };
}

describe("dedupeRevenueEvents --backup (B4-16)", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "dedupe-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parseArgs: --backup=<yol> ve --backup <yol>", () => {
    expect(parseArgs(["--apply", "--backup=/x/y.json"])).toMatchObject({ apply: true, backup: "/x/y.json" });
    expect(parseArgs(["--apply", "--backup", "/x/y.json"])).toMatchObject({ apply: true, backup: "/x/y.json" });
    expect(parseArgs(["--apply"]).backup).toBeNull();
  });

  it("--apply + backup: silinecek tam belgeler önce dosyaya yazılır, sonra silinir", async () => {
    const events = [];
    const model = fakeModel([escrowRow("e"), vaultRow("v")], { events });
    const file = path.join(dir, "backup.json");
    const writeFile = (f, data, opts) => { events.push("write"); return fs.writeFileSync(f, data, opts); };
    const res = await runDedupeRevenueEvents({ model, apply: true, backupPath: file, writeFile });
    expect(events).toEqual(["write", "delete"]);
    expect(res).toMatchObject({ deleted: 1, backedUp: 1 });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(saved.documents).toHaveLength(1);
    expect(saved.documents[0]).toMatchObject({ _id: "e", tx_hash: "0x1", amount: "100" });
  });

  it("yedek yazılamazsa hiçbir şey silinmez", async () => {
    const model = fakeModel([escrowRow("e"), vaultRow("v")]);
    const writeFile = () => { throw new Error("disk full"); };
    await expect(runDedupeRevenueEvents({ model, apply: true, backupPath: path.join(dir, "b.json"), writeFile })).rejects.toThrow("disk full");
    expect(model.deleteMany).not.toHaveBeenCalled();
    expect(model.rows()).toHaveLength(2);
  });

  it("mevcut yedek dosyası ezilmez (wx)", async () => {
    const model = fakeModel([escrowRow("e"), vaultRow("v")]);
    const file = path.join(dir, "b.json");
    fs.writeFileSync(file, "eski");
    await expect(runDedupeRevenueEvents({ model, apply: true, backupPath: file })).rejects.toThrow();
    expect(fs.readFileSync(file, "utf8")).toBe("eski");
    expect(model.deleteMany).not.toHaveBeenCalled();
  });

  it("dry-run yedek yazmaz", async () => {
    const model = fakeModel([escrowRow("e"), vaultRow("v")]);
    const file = path.join(dir, "b.json");
    await runDedupeRevenueEvents({ model, backupPath: file });
    expect(fs.existsSync(file)).toBe(false);
  });
});
