"use strict";

// Escrow kapsamı: şema/indeks sözleşmesi (bağlantı yok, mock yok).

const ACTIVE = "0xa042e919978e929e4d8f9bef73f9a2bcffefee8d";
const ORIGINAL_ENV = { ...process.env };
const scope = () => require("../../backend/scripts/services/escrowScope");
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe("schema contract: compound unique keys, no single-field duplicates", () => {
  // [TR] Gerçek mongoose modelleri (bağlantı yok); yalnız şema/indeks tanımı okunur.
  function loadSchema(file) {
    return require(`../../backend/scripts/models/${file}`).schema;
  }

  const cases = [
    { file: "Order", idField: "onchain_order_id", sparse: false },
    { file: "Trade", idField: "onchain_escrow_id", sparse: true },
    { file: "TerminalTradeStat", idField: "trade_key", sparse: false },
  ];

  for (const c of cases) {
    it(`${c.file}: unique {escrow_address, ${c.idField}}; no single-field index on ${c.idField}`, () => {
      const schema = loadSchema(c.file);
      const indexes = schema.indexes();
      const compound = indexes.find(([k]) => Object.keys(k).join() === `escrow_address,${c.idField}`);
      expect(compound).toBeTruthy();
      expect(compound[1].unique).toBe(true);
      expect(Boolean(compound[1].sparse)).toBe(c.sparse);

      // [TR] Tek alanlı unique/lookup indeksi YOK (IndexOptionsConflict 85/86 önlemi).
      const single = indexes.filter(([k]) => Object.keys(k).length === 1 && k[c.idField] !== undefined);
      expect(single).toEqual([]);
      const opts = schema.path(c.idField).options;
      expect(opts.unique).toBeFalsy();
      expect(opts.index).toBeFalsy();
      expect(schema.path("escrow_address")).toBeTruthy();
      expect(schema.path("chain_id")).toBeTruthy();
    });
  }

  it("proof: scope filter + id equality is served by the compound index prefix", () => {
    process.env.ARAF_ESCROW_ADDRESS = ACTIVE;
    process.env.EXPECTED_CHAIN_ID = "84532";
    for (const c of cases) {
      const schema = loadSchema(c.file);
      const [compoundKey] = schema.indexes().find(([k]) => Object.keys(k).join() === `escrow_address,${c.idField}`);
      const filterKeys = Object.keys({ ...scope().escrowScopeFilter(), [c.idField]: "2" });
      // Filter anahtarları bileşiğin önekiyle (sırayla) birebir örtüşür.
      expect(filterKeys.sort()).toEqual(Object.keys(compoundKey).slice(0, filterKeys.length).sort());
      expect(Object.keys(compoundKey)[0]).toBe("escrow_address");
    }
  });

  it("two orders with the same onchain_order_id in different escrows are both schema-valid", () => {
    const schema = loadSchema("Order");
    const keys = schema.indexes().filter(([, o]) => o.unique).map(([k]) => Object.keys(k).join());
    expect(keys).toContain("escrow_address,onchain_order_id");
    expect(keys).not.toContain("onchain_order_id");
  });
});

