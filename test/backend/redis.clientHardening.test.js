"use strict";

// B4-14: reconnectStrategy, offline kuyruk, IP redaksiyonu, her yeni istemciye dinleyici.

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

function makeClient({ failConnect = false } = {}) {
  const handlers = {};
  return {
    isReady: false,
    isOpen: false,
    handlers,
    on: jest.fn((ev, fn) => { handlers[ev] = fn; }),
    off: jest.fn(),
    connect: jest.fn(async function connect() {
      if (failConnect) throw new Error("connect ECONNREFUSED 10.20.30.40:6379");
      this.isOpen = true;
      this.isReady = true;
    }),
    quit: jest.fn(async () => {}),
  };
}

describe("config/redis hardening (B4-14)", () => {
  const originalEnv = process.env;
  let created;

  function load(clients) {
    jest.resetModules();
    created = [];
    jest.doMock("../../backend/scripts/utils/logger", () => logger);
    jest.doMock("redis", () => ({
      createClient: jest.fn((opts) => {
        const c = clients.shift();
        c.options = opts;
        created.push(c);
        return c;
      }),
    }));
    return require("../../backend/scripts/config/redis");
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL; delete process.env.REDIS_TLS; delete process.env.NODE_ENV;
    Object.values(logger).forEach((f) => f.mockClear());
  });
  afterAll(() => { process.env = originalEnv; });

  it("reconnectStrategy sınırlı gecikme verir, offline kuyruk kapalı", async () => {
    const mod = load([makeClient()]);
    await mod.connectRedis();
    const opts = created[0].options;
    expect(opts.disableOfflineQueue).toBe(true);
    expect(typeof opts.socket.reconnectStrategy).toBe("function");
    expect(opts.socket.reconnectStrategy(0)).toBe(100);
    expect(opts.socket.reconnectStrategy(5)).toBe(600);
    expect(opts.socket.reconnectStrategy(1000)).toBe(3000); // üst sınır
  });

  it("error logunda IP maskelenir", async () => {
    const mod = load([makeClient()]);
    await mod.connectRedis();
    created[0].handlers.error(new Error("connect ECONNREFUSED 10.20.30.40:6379"));
    const logged = logger.error.mock.calls.map((c) => c[0]).join(" ");
    expect(logged).not.toMatch(/10\.20\.30\.40/);
    expect(logged).toContain("[ip]:6379");
    expect(mod.redactIps("tcp [fdaa:0:1::3]:6379 fail")).not.toMatch(/fdaa/);
  });

  it("başarısız connect sonrası yeniden denemede YENİ istemciye de dinleyiciler eklenir", async () => {
    const mod = load([makeClient({ failConnect: true }), makeClient()]);
    await expect(mod.connectRedis()).rejects.toThrow("ECONNREFUSED");
    expect(created[0].handlers.error).toBeDefined();

    await mod.connectRedis();
    expect(created).toHaveLength(2);
    for (const ev of ["error", "connect", "reconnecting", "ready"]) {
      expect(typeof created[1].handlers[ev]).toBe("function");
    }
  });
});
