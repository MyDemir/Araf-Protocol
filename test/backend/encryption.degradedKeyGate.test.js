"use strict";

const WALLET = "0x1111111111111111111111111111111111111111";

describe("degraded boot: KMS key gate + real SEC-01 error classification", () => {
  const originalEnv = process.env;
  let encryption;
  let serviceMode;
  let probe;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "production";
    process.env.KMS_PROVIDER = "env";
    process.env.MASTER_ENCRYPTION_KEY = "a".repeat(64);
    process.env.EXPECTED_CHAIN_ID = "84532";
    process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
    process.env.BASE_RPC_URL = "http://rpc.invalid";
    delete process.env.BASE_RPC_URL_FALLBACKS;
    jest.doMock("../../backend/scripts/utils/logger", () => ({
      warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
    probe = jest.fn();
    jest.doMock("../../backend/scripts/services/rpcProvider", () => ({
      ...jest.requireActual("../../backend/scripts/services/rpcProvider"),
      createChainProbe: () => ({ getNetwork: probe }),
    }));
    encryption = require("../../backend/scripts/services/encryption");
    serviceMode = require("../../backend/scripts/services/serviceMode");
    encryption.clearMasterKeyCache();
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  async function runSelfTestExpectingReject() {
    const p = encryption.runProductionKmsStartupSelfTest().then(() => null, (e) => e);
    await jest.advanceTimersByTimeAsync(20_000);
    return p;
  }

  test("RPC 429: real SEC-01 error is classified transient; key stays unloaded; encryption refuses", async () => {
    probe.mockRejectedValue(Object.assign(new Error("server response 429 Too Many Requests"), { code: "SERVER_ERROR" }));
    const err = await runSelfTestExpectingReject();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("SEC-01 BLOCKER");
    expect(serviceMode.classifyStartupError(err)).toBe("transient");

    encryption.blockKeyLoadingUntilSelfTest();
    await expect(encryption.encryptField("secret", WALLET)).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });
    await expect(encryption.decryptField("00".repeat(40), WALLET)).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });
    await expect(encryption.hmacDigest("p", "v")).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });
    await expect(encryption.encryptPayoutProfile({}, WALLET)).rejects.toBeTruthy();
  });

  test("RPC network error (ECONNREFUSED) => transient", async () => {
    probe.mockRejectedValue(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { code: "ECONNREFUSED" }));
    const err = await runSelfTestExpectingReject();
    expect(serviceMode.classifyStartupError(err)).toBe("transient");
  });

  test("definitively wrong chain (8453) => fatal, never degraded", async () => {
    probe.mockResolvedValue({ chainId: 8453n });
    const err = await runSelfTestExpectingReject();
    expect(err.message).toContain("SEC-01 BLOCKER");
    expect(serviceMode.classifyStartupError(err)).toBe("fatal");
  });

  test("transient on primary then wrong chain on fallback => fatal", async () => {
    process.env.BASE_RPC_URL_FALLBACKS = "http://fallback.invalid";
    probe.mockRejectedValueOnce(Object.assign(new Error("server response 429"), { code: "SERVER_ERROR" }));
    probe.mockResolvedValue({ chainId: 1n });
    const err = await runSelfTestExpectingReject();
    expect(serviceMode.classifyStartupError(err)).toBe("fatal");
  });

  test("other SEC-01 blockers (env KMS in prod without exception) => fatal", async () => {
    delete process.env.ALLOW_ENV_KMS_ON_TESTNET;
    const err = await runSelfTestExpectingReject();
    expect(err.message).toContain("SEC-01 BLOCKER");
    expect(serviceMode.classifyStartupError(err)).toBe("fatal");
  });

  test("key gate stays closed after a failed re-check and reopens only after chain 84532 is verified", async () => {
    encryption.blockKeyLoadingUntilSelfTest();
    probe.mockRejectedValue(Object.assign(new Error("server response 429"), { code: "SERVER_ERROR" }));
    expect(await runSelfTestExpectingReject()).toBeInstanceOf(Error);
    await expect(encryption.encryptField("x", WALLET)).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });

    probe.mockReset();
    probe.mockResolvedValue({ chainId: 84532n });
    await expect(encryption.runProductionKmsStartupSelfTest()).resolves.toMatchObject({ ok: true });
    const enc = await encryption.encryptField("x", WALLET);
    await expect(encryption.decryptField(enc, WALLET)).resolves.toBe("x");
  });

  test("wrong chain during recovery does not reopen the gate", async () => {
    encryption.blockKeyLoadingUntilSelfTest();
    probe.mockResolvedValue({ chainId: 8453n });
    expect(await runSelfTestExpectingReject()).toBeInstanceOf(Error);
    await expect(encryption.encryptField("x", WALLET)).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });
  });
});
