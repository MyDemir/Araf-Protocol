"use strict";

jest.mock("../../backend/scripts/utils/logger", () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const {
  createRpcPool,
  getRpcUrls,
  classifyRpcError,
  isRateLimitError,
  redactRpcUrl,
  redactRpcSecrets,
} = require("../../backend/scripts/services/rpcProvider");
const { redactLogString } = require("../../backend/scripts/utils/logRedaction");

const A = "https://primary.example/v2/PRIMARYKEY1234567890";
const B = "https://fallback.example/v2/FALLBACKKEY1234567890";

describe("redactRpcUrl", () => {
  it("masks the Alchemy /v2/ key", () => {
    expect(redactRpcUrl("https://base-mainnet.g.alchemy.com/v2/abcDEF123456789012345"))
      .toBe("https://base-mainnet.g.alchemy.com/v2/[REDACTED]");
  });
  it("masks Infura /v3/, QuickNode path token and ?apikey=", () => {
    expect(redactRpcUrl("https://base-mainnet.infura.io/v3/short")).not.toContain("short");
    expect(redactRpcUrl("https://x.base.quiknode.pro/0123456789abcdef0123456789abcdef/")).not.toContain("0123456789abcdef");
    const q = redactRpcUrl("https://rpc.example/path?apikey=SECRET123");
    expect(q).not.toContain("SECRET123");
    expect(q).toContain("rpc.example");
  });
  it("masks the requestUrl field inside ethers error messages, also via the shared log redactor", () => {
    const msg = 'bad response (request={ "url": "https://base-mainnet.g.alchemy.com/v2/SECRETKEY123456" }, requestUrl="https://a.io/v2/SECRETKEY999999")';
    expect(redactRpcSecrets(msg)).not.toMatch(/SECRETKEY/);
    expect(redactLogString(msg)).not.toMatch(/SECRETKEY/);
  });
  it("returns a placeholder for garbage", () => {
    expect(redactRpcUrl("not a url")).toBe("[invalid-rpc-url]");
  });
});

describe("error classification", () => {
  it("recognises 429 / compute units / capacity / exceeded", () => {
    expect(isRateLimitError(new Error('code 429 "Your app has exceeded its compute units per second capacity"'))).toBe(true);
    expect(isRateLimitError({ info: { response: { statusCode: 429 } }, message: "bad response" })).toBe(true);
    expect(isRateLimitError(new Error("something unrelated"))).toBe(false);
  });
  it("monthly capacity and block range kinds", () => {
    expect(classifyRpcError(new Error("429 Monthly capacity limit exceeded"))).toBe("monthly");
    expect(classifyRpcError(new Error("Log response size exceeded"))).toBe("range");
    expect(classifyRpcError(new Error("eth_getLogs is limited to a 10 block range"))).toBe("range");
    expect(classifyRpcError(new Error("compute units per second"))).toBe("rate");
  });
});

describe("getRpcUrls", () => {
  it("returns primary then comma-separated fallbacks without duplicates", () => {
    expect(getRpcUrls({ BASE_RPC_URL: A, BASE_RPC_URL_FALLBACKS: ` ${B} , ${A},, ` })).toEqual([A, B]);
    expect(getRpcUrls({})).toEqual([]);
  });
});

describe("RpcPool failover with chain verification", () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, EXPECTED_CHAIN_ID: "8453", NODE_ENV: "test" };
  });
  afterAll(() => { process.env = originalEnv; });

  function makePool({ chains, sends, now }) {
    return createRpcPool({
      urls: [A, B],
      probeFor: (url) => ({ getNetwork: async () => { const c = chains[url]; if (c instanceof Error) throw c; return { chainId: BigInt(c) }; } }),
      createInner: (url) => ({ _send: (payload) => sends[url](payload) }),
      now,
    });
  }

  it("uses the primary while healthy", async () => {
    const sends = { [A]: jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]), [B]: jest.fn() };
    const pool = makePool({ chains: { [A]: 8453, [B]: 8453 }, sends });
    await pool.send([{ id: 1 }]);
    expect(sends[A]).toHaveBeenCalledTimes(1);
    expect(sends[B]).not.toHaveBeenCalled();
  });

  it("fails over to a verified fallback on primary 429 and keeps it for the cooldown", async () => {
    let t = 1000;
    const sends = {
      [A]: jest.fn().mockRejectedValue(new Error('code 429 "exceeded its compute units per second capacity"')),
      [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0x2" }]),
    };
    const pool = makePool({ chains: { [A]: 8453, [B]: 8453 }, sends, now: () => t });
    await expect(pool.send([{ id: 1 }])).resolves.toEqual([{ id: 1, result: "0x2" }]);
    await pool.send([{ id: 2 }]);
    expect(sends[A]).toHaveBeenCalledTimes(1); // soğuma: primary tekrar denenmedi
    expect(sends[B]).toHaveBeenCalledTimes(2);
    t += 11 * 60_000; // soğuma bitti
    sends[A].mockResolvedValue([{ id: 3, result: "0x3" }]);
    await expect(pool.send([{ id: 3 }])).resolves.toEqual([{ id: 3, result: "0x3" }]);
  });

  it("fails over on a JSON-RPC level 429 error object too", async () => {
    const sends = {
      [A]: jest.fn().mockResolvedValue([{ id: 1, error: { code: 429, message: "exceeded compute units" } }]),
      [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0x9" }]),
    };
    const pool = makePool({ chains: { [A]: 8453, [B]: 8453 }, sends });
    await expect(pool.send([{ id: 1 }])).resolves.toEqual([{ id: 1, result: "0x9" }]);
  });

  it("NEVER uses an unverified (wrong-chain) fallback", async () => {
    const sends = {
      [A]: jest.fn().mockRejectedValue(new Error("429 compute units")),
      [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0xbad" }]),
    };
    const pool = makePool({ chains: { [A]: 8453, [B]: 1 }, sends });
    await expect(pool.send([{ id: 1 }])).rejects.toThrow(/429/);
    expect(sends[B]).not.toHaveBeenCalled();
    expect(pool.entries[1].rejected).toBe(true);
  });

  it("does not use a fallback whose chain cannot be read (unreachable)", async () => {
    const sends = {
      [A]: jest.fn().mockRejectedValue(new Error("429 compute units")),
      [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0xbad" }]),
    };
    const pool = makePool({ chains: { [A]: 8453, [B]: new Error("ECONNREFUSED") }, sends });
    await expect(pool.send([{ id: 1 }])).rejects.toBeTruthy();
    expect(sends[B]).not.toHaveBeenCalled();
  });

  it("a wrong-chain PRIMARY is surfaced, never silently replaced by a fallback", async () => {
    const sends = { [A]: jest.fn(), [B]: jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]) };
    const pool = makePool({ chains: { [A]: 1, [B]: 8453 }, sends });
    await expect(pool.send([{ id: 1 }])).rejects.toThrow(/ChainGuard/);
    expect(sends[A]).not.toHaveBeenCalled();
    expect(sends[B]).not.toHaveBeenCalled();
  });

  it("verifies the chain only once per URL (no repeated eth_chainId)", async () => {
    const probe = jest.fn(async () => ({ chainId: 8453n }));
    const pool = createRpcPool({
      urls: [A],
      probeFor: () => ({ getNetwork: probe }),
      createInner: () => ({ _send: jest.fn().mockResolvedValue([{ id: 1, result: "0x1" }]) }),
    });
    await pool.send([{ id: 1 }]);
    await pool.send([{ id: 2 }]);
    await pool.verifiedChainId();
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
