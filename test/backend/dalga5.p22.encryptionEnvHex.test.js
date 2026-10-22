// [TR] B2-19(a): env provider hex olmayan anahtarı sessizce kısa tampona çevirmez.
describe("P22 B2-19 env anahtarı hex doğrulaması", () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; jest.resetModules(); });

  function load() {
    jest.resetModules();
    process.env.NODE_ENV = "development";
    process.env.KMS_PROVIDER = "env";
    return require("../../backend/scripts/services/encryption");
  }
  const W = "0x" + "a".repeat(40);

  it("hex olmayan karakterli 64+ karakterlik anahtar reddedilir", async () => {
    const enc = load();
    process.env.MASTER_ENCRYPTION_KEY = "zz" + "a".repeat(62);
    await expect(enc.encryptField("x", W)).rejects.toThrow(/hex/i);
  });

  it("geçerli 64 hex (büyük/küçük harf) çalışır ve çözülür", async () => {
    const enc = load();
    process.env.MASTER_ENCRYPTION_KEY = "Ab".repeat(32);
    const c = await enc.encryptField("merhaba", W);
    await expect(enc.decryptField(c, W)).resolves.toBe("merhaba");
  });
});
