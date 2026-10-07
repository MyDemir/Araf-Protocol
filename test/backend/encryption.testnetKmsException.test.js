"use strict";

const WALLET = "0x1111111111111111111111111111111111111111";
const SEC01 = "Production'da KMS_PROVIDER='env' kullanılamaz";

describe("SEC-01 testnet env-KMS exception", () => {
  const originalEnv = process.env;
  let warn;
  let encryption;

  function load() {
    jest.resetModules(); // _masterKeyCache sızmasın
    warn = jest.fn();
    jest.doMock("../../backend/scripts/utils/logger", () => ({
      warn, info: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
    encryption = require("../../backend/scripts/services/encryption");
    encryption.clearMasterKeyCache();
  }

  // load() mock'ları sıfırlar; ethers mock'u önceden kurulduğu için resetModules yapmadan yalnızca yeniden require eder
  function load2() {
    warn = jest.fn();
    jest.doMock("../../backend/scripts/utils/logger", () => ({
      warn, info: jest.fn(), error: jest.fn(), debug: jest.fn(),
    }));
    jest.isolateModules(() => {
      encryption = require("../../backend/scripts/services/encryption");
    });
    encryption.clearMasterKeyCache();
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.KMS_PROVIDER = "env";
    process.env.MASTER_ENCRYPTION_KEY = "a".repeat(64);
    delete process.env.EXPECTED_CHAIN_ID;
    delete process.env.ALLOW_ENV_KMS_ON_TESTNET;
    load();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("(a) prod + 84532 + yes: key read, loud warning logged", async () => {
    process.env.NODE_ENV = "production";
    process.env.EXPECTED_CHAIN_ID = "84532";
    process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
    const enc = await encryption.encryptField("x", WALLET);
    await expect(encryption.decryptField(enc, WALLET)).resolves.toBe("x");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("TESTNET ONLY"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain(process.env.MASTER_ENCRYPTION_KEY);
  });

  describe("startup self-test RPC chain check", () => {
    function mockRpc(getNetwork) {
      jest.doMock("ethers", () => ({
        ethers: { JsonRpcProvider: jest.fn().mockImplementation(() => ({ getNetwork })) },
      }));
    }
    beforeEach(() => {
      process.env.NODE_ENV = "production";
      process.env.EXPECTED_CHAIN_ID = "84532";
      process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
      process.env.BASE_RPC_URL = "http://rpc.invalid";
    });

    test("chainId 84532 -> ok", async () => {
      mockRpc(jest.fn().mockResolvedValue({ chainId: 84532n }));
      load2();
      await expect(encryption.runProductionKmsStartupSelfTest()).resolves.toEqual({ ok: true, provider: "env" });
    });

    test("RPC chainId 8453 -> startup error without key value", async () => {
      mockRpc(jest.fn().mockResolvedValue({ chainId: 8453n }));
      load2();
      const err = await encryption.runProductionKmsStartupSelfTest().catch((e) => e);
      expect(err.message).toContain("SEC-01 BLOCKER");
      expect(err.message).not.toContain(process.env.MASTER_ENCRYPTION_KEY);
    });

    test("RPC unreachable -> startup error", async () => {
      mockRpc(jest.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      load2();
      await expect(encryption.runProductionKmsStartupSelfTest()).rejects.toThrow("SEC-01 BLOCKER");
    });

    test("missing BASE_RPC_URL -> startup error", async () => {
      delete process.env.BASE_RPC_URL;
      load2();
      await expect(encryption.runProductionKmsStartupSelfTest()).rejects.toThrow("BASE_RPC_URL");
    });

    test("EXPECTED_CHAIN_ID=' 84532' (whitespace) is rejected", async () => {
      process.env.EXPECTED_CHAIN_ID = " 84532";
      mockRpc(jest.fn().mockResolvedValue({ chainId: 84532n }));
      load2();
      await expect(encryption.runProductionKmsStartupSelfTest()).rejects.toThrow("SEC-01 BLOCKER");
    });

    test("cache does not bypass SEC-01 when env changes after first read", async () => {
      await encryption.encryptField("x", WALLET).catch(() => {});
      delete process.env.ALLOW_ENV_KMS_ON_TESTNET;
      await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(SEC01);
    });
  });

  test("(a2) exception still requires 64-hex master key", async () => {
    process.env.NODE_ENV = "production";
    process.env.EXPECTED_CHAIN_ID = "84532";
    process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
    process.env.MASTER_ENCRYPTION_KEY = "abcd";
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow("MASTER_ENCRYPTION_KEY");
  });

  test.each(["true", "YES", "1", "", undefined])("(b) prod + 84532 + flag=%p: SEC-01", async (flag) => {
    process.env.NODE_ENV = "production";
    process.env.EXPECTED_CHAIN_ID = "84532";
    if (flag !== undefined) process.env.ALLOW_ENV_KMS_ON_TESTNET = flag;
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(SEC01);
    await expect(encryption.runProductionKmsStartupSelfTest()).rejects.toThrow("SEC-01 BLOCKER");
  });

  test("(c) prod + 8453 + yes: error explicitly says testnet-only", async () => {
    process.env.NODE_ENV = "production";
    process.env.EXPECTED_CHAIN_ID = "8453";
    process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(/SEC-01[\s\S]*testnet-only/);
    await expect(encryption.runProductionKmsStartupSelfTest()).rejects.toThrow("SEC-01 BLOCKER");
  });

  test("(d) prod + no EXPECTED_CHAIN_ID + yes: error", async () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_ENV_KMS_ON_TESTNET = "yes";
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(SEC01);
  });

  test("(e) development: legacy behavior, flag irrelevant", async () => {
    process.env.NODE_ENV = "development";
    const enc = await encryption.encryptField("x", WALLET);
    await expect(encryption.decryptField(enc, WALLET)).resolves.toBe("x");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("sadece development"));
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("TESTNET ONLY"));
  });
});
