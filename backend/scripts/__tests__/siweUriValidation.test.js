"use strict";

const mockGetDel = jest.fn();
const mockSiweMessageFactory = jest.fn();

jest.mock("siwe", () => ({
  SiweMessage: jest.fn((...args) => mockSiweMessageFactory(...args)),
}));

jest.mock("../config/redis", () => ({
  getRedisClient: () => ({ getDel: mockGetDel }),
}));

describe("SIWE URI origin validation", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.JWT_SECRET = "Z3x!9Lm#2Qp@8Vr$1Ty%6Ui^4Op&7As*0Df(5Gh)3Jk+1Bn=9Cv?2Wx~8Er_AaBbCc";
    process.env.SIWE_DOMAIN = "app.araf.io";
    process.env.SIWE_URI = "https://app.araf.io";
    mockGetDel.mockResolvedValue("nonce-1");
  });

  test("accepts exact origin match", async () => {
    mockSiweMessageFactory.mockReturnValue({
      domain: "app.araf.io",
      uri: "https://app.araf.io/login",
      nonce: "nonce-1",
      address: "0x1111111111111111111111111111111111111111",
      verify: jest.fn().mockResolvedValue({ success: true }),
    });

    const { verifySiweSignature } = require("../services/siwe");
    await expect(verifySiweSignature("msg", "0x" + "a".repeat(130))).resolves.toBe(
      "0x1111111111111111111111111111111111111111"
    );
  });

  test("rejects prefix-bypass origin", async () => {
    mockSiweMessageFactory.mockReturnValue({
      domain: "app.araf.io",
      uri: "https://app.araf.io.attacker.tld/login",
      nonce: "nonce-1",
      address: "0x1111111111111111111111111111111111111111",
      verify: jest.fn().mockResolvedValue({ success: true }),
    });

    const { verifySiweSignature } = require("../services/siwe");
    await expect(verifySiweSignature("msg", "0x" + "a".repeat(130))).rejects.toThrow(/origin/);
  });
});
