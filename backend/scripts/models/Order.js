"use strict";

const mongoose = require("mongoose");

// ═══════════════════════════════════════════════════════════════════════════════
// ORDER MODEL — V3 Parent Order Aynası
// ═══════════════════════════════════════════════════════════════════════════════
//
// [TR] Bu model kontrattaki parent order gerçekliğinin off-chain mirror'ıdır.
//      Otorite kontrattadır; bu belge/query modeli yalnız indeksleme, arama,
//      dashboard ve kullanıcı paneli için kullanılır.
//
//      V3 kuralı korunur:
//      - remaining_amount authoritative source = kontrat
//      - fee snapshot authoritative source      = kontrat
//      - backend reservation authority değildir
//
// [EN] This model is the off-chain mirror of the on-chain parent order reality.
//      The contract remains authoritative; this model exists only for indexing,
//      search, dashboards, and user-facing queries.
//
//      V3 rule preserved:
//      - authoritative source of remaining_amount = contract
//      - authoritative source of fee snapshots    = contract
//      - backend is NOT a reservation authority
//

const orderSchema = new mongoose.Schema(
  {
    onchain_order_id: {
      type:   Number,
      unique: true,
      sparse: true,
    },

    owner_address: {
      type:      String,
      required:  true,
      lowercase: true,
      match:     /^0x[a-fA-F0-9]{40}$/,
      index:     true,
    },

    side: {
      type:     String,
      required: true,
      enum:     ["SELL_CRYPTO", "BUY_CRYPTO"],
      index:    true,
    },

    status: {
      type:    String,
      enum:    ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELED"],
      default: "OPEN",
      index:   true,
    },

    tier: {
      type:     Number,
      enum:     [0, 1, 2, 3, 4],
      required: true,
      index:    true,
    },

    token_address: {
      type:      String,
      required:  true,
      lowercase: true,
      match:     /^0x[a-fA-F0-9]{40}$/,
      index:     true,
    },

    // [TR] Off-chain market görünümü için zenginleştirme alanları.
    //      Bunlar ekonomik enforcement kaynağı değildir.
    // [EN] Enrichment fields for off-chain market views.
    //      They are NOT the source of economic enforcement.
    market: {
      crypto_asset:  { type: String, enum: ["USDT", "USDC"], default: null },
      fiat_currency: { type: String, enum: ["TRY", "USD", "EUR"], default: null },
      exchange_rate: { type: Number, default: null },
    },

    amounts: {
      // [TR] Otoritatif toplam emir miktarı — base units String.
      // [EN] Authoritative total order amount — base units String.
      total_amount: { type: String, required: true },

      // [TR] Yaklaşık Number cache (analytics/UI). Enforcement için kullanılmaz.
      // [EN] Approximate Number cache (analytics/UI). Not used for enforcement.
      total_amount_num: { type: Number, default: 0 },

      // [TR] Otoritatif kalan miktar — kontrat mirror'ı.
      // [EN] Authoritative remaining amount — contract mirror.
      remaining_amount: { type: String, required: true },

      // [TR] Yaklaşık Number cache (analytics/UI).
      // [EN] Approximate Number cache (analytics/UI).
      remaining_amount_num: { type: Number, default: 0 },

      // [TR] Otoritatif minimum fill miktarı — base units String.
      // [EN] Authoritative minimum fill amount — base units String.
      min_fill_amount: { type: String, required: true },

      // [TR] Yaklaşık Number cache (analytics/UI).
      // [EN] Approximate Number cache (analytics/UI).
      min_fill_amount_num: { type: Number, default: 0 },

      // [TR] Yürütülmüş toplam miktar. Kontrat gerçeğinden türetilmiş cache'dir.
      // [EN] Executed cumulative amount. Derived cache from contract truth.
      executed_amount: { type: String, default: "0" },

      // [TR] Yaklaşık Number cache.
      // [EN] Approximate Number cache.
      executed_amount_num: { type: Number, default: 0 },
    },

    reserves: {
      // [TR] SELL order'larda maker reserve; BUY order'larda genelde "0" kalır.
      // [EN] Maker reserve for SELL orders; generally remains "0" for BUY orders.
      remaining_maker_bond_reserve: { type: String, default: "0" },
      remaining_maker_bond_reserve_num: { type: Number, default: 0 },

      // [TR] BUY order'larda taker reserve; SELL order'larda genelde "0" kalır.
      // [EN] Taker reserve for BUY orders; generally remains "0" for SELL orders.
      remaining_taker_bond_reserve: { type: String, default: "0" },
      remaining_taker_bond_reserve_num: { type: Number, default: 0 },
    },

    fee_snapshot: {
      // [TR] Parent order create anında kontratın sabitlediği fee snapshot.
      //      Owner fee'yi sonra değiştirse bile bu order'dan doğan child trade'ler
      //      eski snapshot ile korunur.
      // [EN] Fee snapshot frozen by the contract at parent order creation.
      //      Even if the owner changes fees later, child trades spawned from this
      //      order remain protected by the old snapshot.
      taker_fee_bps_snapshot: { type: Number, default: null, min: 0 },
      maker_fee_bps_snapshot: { type: Number, default: null, min: 0 },
    },

    refs: {
      // [TR] Parent order canonical ref'i. Zero/missing ref meşru order yaratımı
      //      gibi yorumlanmamalıdır.
      // [EN] Canonical ref for the parent order. Zero/missing refs must not be
      //      interpreted as legitimate order creation.
      order_ref: {
        type:      String,
        lowercase: true,
        default:   null,
        index:     true,
        sparse:    true,
        unique:    true,
        match:     /^0x[a-f0-9]{64}$/,
      },
    },

    stats: {
      // [TR] Bu alanlar query/dashboard kolaylığı sağlar; tek başına otorite değildir.
      // [EN] These fields support query/dashboard convenience; they are not authoritative alone.
      child_trade_count: { type: Number, default: 0, min: 0 },
      last_fill_tx_hash: { type: String, default: null },
    },

    timers: {
      created_onchain_at: { type: Date, default: null },
      last_fill_at:       { type: Date, default: null },
      filled_at:          { type: Date, default: null },
      canceled_at:        { type: Date, default: null },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
orderSchema.index({ owner_address: 1, status: 1 });
orderSchema.index({ side: 1, status: 1, tier: 1 });
orderSchema.index({ token_address: 1, side: 1, status: 1 });
orderSchema.index({ "amounts.remaining_amount_num": 1, status: 1 });
orderSchema.index({ "timers.last_fill_at": 1 }, { sparse: true });

// ── Hooks ─────────────────────────────────────────────────────────────────────
orderSchema.pre("save", function (next) {
  try {
    const total = BigInt(this.amounts.total_amount || "0");
    const remaining = BigInt(this.amounts.remaining_amount || "0");
    const minFill = BigInt(this.amounts.min_fill_amount || "0");

    if (total <= 0n) {
      return next(new Error("amounts.total_amount must be greater than zero"));
    }

    if (remaining < 0n || remaining > total) {
      return next(new Error("amounts.remaining_amount must be between 0 and total_amount"));
    }

    if (minFill <= 0n || minFill > total) {
      return next(new Error("amounts.min_fill_amount must be greater than zero and <= total_amount"));
    }

    return next();
  } catch (err) {
    return next(err);
  }
});

// ── Virtuals ──────────────────────────────────────────────────────────────────
orderSchema.virtual("isOpenForFill").get(function () {
  return this.status === "OPEN" || this.status === "PARTIALLY_FILLED";
});

orderSchema.virtual("isSellOrder").get(function () {
  return this.side === "SELL_CRYPTO";
});

orderSchema.virtual("isBuyOrder").get(function () {
  return this.side === "BUY_CRYPTO";
});

module.exports = mongoose.model("Order", orderSchema);
