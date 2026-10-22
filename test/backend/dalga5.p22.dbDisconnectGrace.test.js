// [TR] B4-15: 'disconnected' olayında kısa yeniden bağlanma süresi, env'den pool/socket ayarı.
describe("P22 B4-15 db.js", () => {
  let handlers, connectMock, exitSpy, db;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    handlers = {};
    connectMock = jest.fn(async () => {});
    jest.doMock("mongoose", () => ({
      set: jest.fn(),
      connect: connectMock,
      connection: { readyState: 0, on: (ev, fn) => { handlers[ev] = fn; } },
    }));
    jest.doMock("../../backend/scripts/utils/logger", () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    }));
    exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    process.env.MONGODB_URI = "mongodb://u:p@host/db";
    delete process.env.MONGO_DISCONNECT_GRACE_MS;
    delete process.env.MONGO_MAX_POOL_SIZE;
    delete process.env.MONGO_SOCKET_TIMEOUT_MS;
    db = require("../../backend/scripts/config/db");
  });

  afterEach(() => {
    jest.useRealTimers();
    exitSpy.mockRestore();
  });

  it("disconnected'te hemen çıkmaz; süre dolunca çıkar (fail-fast korunur)", async () => {
    await db.connectDB();
    handlers.disconnected();
    expect(exitSpy).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("süre içinde reconnected gelirse çıkmaz", async () => {
    await db.connectDB();
    handlers.disconnected();
    jest.advanceTimersByTime(3_000);
    handlers.reconnected();
    jest.advanceTimersByTime(60_000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("graceful shutdown'da çıkış bastırılır", async () => {
    await db.connectDB();
    db.setAllowProcessExitOnDisconnect(false);
    handlers.disconnected();
    jest.advanceTimersByTime(60_000);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("varsayılanlar eskisiyle aynı: pool 100, socket 20s; env ile ayarlanır, geçersiz değer varsayılana düşer", async () => {
    await db.connectDB();
    expect(connectMock.mock.calls[0][1]).toMatchObject({ maxPoolSize: 100, socketTimeoutMS: 20_000 });
    jest.resetModules();
    process.env.MONGO_MAX_POOL_SIZE = "40";
    process.env.MONGO_SOCKET_TIMEOUT_MS = "abc";
    const db2 = require("../../backend/scripts/config/db");
    await db2.connectDB();
    const opts = connectMock.mock.calls[1][1];
    expect(opts.maxPoolSize).toBe(40);
    expect(opts.socketTimeoutMS).toBe(20_000);
  });
});
