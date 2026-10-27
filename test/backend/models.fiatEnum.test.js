"use strict";

const Order = require("../../backend/scripts/models/Order");
const Trade = require("../../backend/scripts/models/Trade");

const paths = [
  ["Order", Order, "market.fiat_currency"],
  ["Trade", Trade, "financials.fiat_currency"],
];

describe("fiat_currency enum derives from the rail catalog", () => {
  for (const [name, Model, path] of paths) {
    const check = (value) => {
      const doc = new Model();
      doc.set(path, value);
      const err = doc.validateSync(path);
      return err ? err.errors[path] : undefined;
    };
    it(`${name}: catalog fiat (GBP, TRY, USD, EUR) and null pass`, () => {
      for (const v of ["GBP", "TRY", "USD", "EUR", null]) expect(check(v)).toBeUndefined();
    });
    it(`${name}: non-catalog fiat is rejected`, () => {
      expect(check("XYZ")).toBeDefined();
    });
  }
});
