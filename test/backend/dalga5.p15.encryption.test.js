"use strict";

// Dalga 5 P15: B2-04 (AWS KMS: önce doğrula, sonra önbelleğe yaz; Plaintext sıfırlanır),
// B2-05 (zaman aşımı + single-flight).

const WALLET = "0x1111111111111111111111111111111111111111";

function load(sendImpl) {
  const send = sendImpl;
  const DecryptCommand = jest.fn().mockImplementation((input) => ({ input }));
  const KMSClient = jest.fn().mockImplementation(() => ({ send }));
  jest.doMock("@aws-sdk/client-kms", () => ({ KMSClient, DecryptCommand }));
  const encryption = require("../../backend/scripts/services/encryption");
  return { encryption, send, KMSClient };
}

describe("encryption AWS KMS (Dalga 5 P15)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: "test", KMS_PROVIDER: "aws", AWS_ENCRYPTED_DATA_KEY: Buffer.from("blob").toString("base64") };
    delete process.env.MASTER_ENCRYPTION_KEY;
  });
  afterAll(() => { process.env = originalEnv; });

  test("B2-04: geçersiz uzunlukta anahtar önbelleğe girmez; sonraki çağrı yine KMS'e gider ve reddeder", async () => {
    const send = jest.fn().mockResolvedValue({ Plaintext: Buffer.alloc(16, 1) });
    const { encryption } = load(send);
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(/length invalid/);
    await expect(encryption.encryptField("x", WALLET)).rejects.toThrow(/length invalid/);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("B2-04: KMS'ten gelen Plaintext tamponu kullanımdan sonra sıfırlanır", async () => {
    const plaintext = new Uint8Array(32).fill(7);
    const send = jest.fn().mockResolvedValue({ Plaintext: plaintext });
    const { encryption } = load(send);
    const enc = await encryption.encryptField("hello", WALLET);
    expect(await encryption.decryptField(enc, WALLET)).toBe("hello");
    expect([...plaintext].every((b) => b === 0)).toBe(true);
  });

  test("B2-05: kms.send zaman aşımı sinyaliyle çağrılır", async () => {
    const send = jest.fn().mockResolvedValue({ Plaintext: Buffer.alloc(32, 3) });
    const { encryption } = load(send);
    await encryption.encryptField("x", WALLET);
    const opts = send.mock.calls[0][1];
    expect(opts?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  test("B2-05: boş önbellekte eşanlı istekler tek KMS çağrısını paylaşır", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const send = jest.fn(async () => { await gate; return { Plaintext: Buffer.alloc(32, 5) }; });
    const { encryption, KMSClient } = load(send);
    const all = Promise.all([1, 2, 3, 4].map((i) => encryption.encryptField(`v${i}`, WALLET)));
    await new Promise((r) => setImmediate(r));
    release();
    await all;
    expect(send).toHaveBeenCalledTimes(1);
    expect(KMSClient).toHaveBeenCalledTimes(1);
  });

  test("B2-05: uçuştaki çağrı sırasında önbellek geçersiz kılınırsa anahtar önbelleğe yazılmaz (SEC-01)", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const send = jest.fn(async () => { await gate; return { Plaintext: Buffer.alloc(32, 5) }; });
    const { encryption } = load(send);
    const pending = encryption.encryptField("x", WALLET);
    await new Promise((r) => setImmediate(r));
    encryption.blockKeyLoadingUntilSelfTest();
    release();
    await expect(pending).rejects.toThrow();
    await expect(encryption.encryptField("y", WALLET)).rejects.toMatchObject({ code: "KMS_UNAVAILABLE_DEGRADED" });
  });
});
