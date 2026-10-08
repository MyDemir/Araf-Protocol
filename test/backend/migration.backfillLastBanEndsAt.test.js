"use strict";

const { parseArgs, runBackfillLastBanEndsAt } = require("../../backend/scripts/migrations/backfillLastBanEndsAt");

function makeUserModel(users) {
  const updateOne = jest.fn(async (filter, update) => {
    const u = users.find((x) => x.wallet_address === filter.wallet_address);
    if (!u || u.last_ban_ends_at) return { modifiedCount: 0 };
    Object.assign(u, update.$set);
    return { modifiedCount: 1 };
  });
  const chain = {
    select: () => chain,
    limit: () => chain,
    lean: async () => users.filter((u) => !u.last_ban_ends_at && u.banned_until == null && u.consecutive_bans > 0),
  };
  return { find: jest.fn(() => chain), updateOne };
}

describe("backfillLastBanEndsAt migration", () => {
  const A = "0x" + "aa".repeat(20);
  const B = "0x" + "bb".repeat(20);
  const mk = () => [
    { wallet_address: A, consecutive_bans: 2, banned_until: null, last_ban_ends_at: null },
    { wallet_address: B, consecutive_bans: 1, banned_until: null, last_ban_ends_at: null },
  ];
  const contract = {
    getReputation: jest.fn(async (w) => ({ bannedUntil: w === A ? 1700000000 : 0 })),
  };

  it("defaults to dry-run and writes nothing", async () => {
    expect(parseArgs([]).apply).toBe(false);
    const users = mk();
    const User = makeUserModel(users);
    const r = await runBackfillLastBanEndsAt({ UserModel: User, contract });
    expect(r).toMatchObject({ dryRun: true, wouldUpdate: 1, updated: 0, noBanOnChain: 1 });
    expect(User.updateOne).not.toHaveBeenCalled();
  });

  it("--apply fills from chain and is idempotent", async () => {
    const users = mk();
    const User = makeUserModel(users);
    expect(parseArgs(["--apply"]).apply).toBe(true);
    const r1 = await runBackfillLastBanEndsAt({ apply: true, UserModel: User, contract });
    expect(r1.updated).toBe(1);
    expect(users[0].last_ban_ends_at).toEqual(new Date(1700000000 * 1000));
    expect(users[1].last_ban_ends_at).toBeNull();
    const r2 = await runBackfillLastBanEndsAt({ apply: true, UserModel: User, contract });
    expect(r2.updated).toBe(0);
  });
});
