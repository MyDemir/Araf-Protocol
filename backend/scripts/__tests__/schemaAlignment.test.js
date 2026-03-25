"use strict";

const { Trade } = require("../models/Trade");

describe("Trade schema alignment", () => {
  test("financial and cancel_proposal paths exist and are typed", () => {
    expect(Trade.schema.path("financials.crypto_amount").instance).toBe("String");
    expect(Trade.schema.path("financials.crypto_amount_num").instance).toBe("Number");
    expect(Trade.schema.path("financials.total_decayed").instance).toBe("String");
    expect(Trade.schema.path("financials.total_decayed_num").instance).toBe("Number");
    expect(Trade.schema.path("financials.decay_tx_hashes")).toBeTruthy();
    expect(Trade.schema.path("financials.decayed_amounts")).toBeTruthy();
    expect(Trade.schema.path("cancel_proposal.proposed_at").instance).toBe("Date");
    expect(Trade.schema.path("cancel_proposal.approved_by").instance).toBe("String");
  });
});

