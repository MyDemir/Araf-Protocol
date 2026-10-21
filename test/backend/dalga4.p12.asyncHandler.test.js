// B2-17: async route handler reddi süreci düşürmemeli; next(err)'e gitmeli.
const express = require('express');
const request = require('supertest');
const { asyncHandler } = require('../../backend/scripts/utils/asyncHandler');

describe('asyncHandler', () => {
  it('reddedilen async handler hatasını next(err)e iletir ve errorHandler yanıt verir', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const app = express();
    app.get('/boom', asyncHandler(async () => { throw new Error('cast failed'); }));
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

    const res = await request(app).get('/boom');
    await new Promise((r) => setImmediate(r));
    process.off('unhandledRejection', unhandled);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'cast failed' });
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('senkron throw da next(err)e gider; başarılı handler yanıtını korur', async () => {
    const app = express();
    app.get('/sync', asyncHandler(() => { throw new Error('sync'); }));
    app.get('/ok', asyncHandler(async (_req, res) => res.json({ ok: true })));
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
    expect((await request(app).get('/sync')).body).toEqual({ error: 'sync' });
    expect((await request(app).get('/ok')).body).toEqual({ ok: true });
  });

  it('fonksiyon olmayan girdiyi reddeder', () => {
    expect(() => asyncHandler(null)).toThrow(TypeError);
  });
});

jest.mock("../../backend/scripts/middleware/rateLimiter", () => new Proxy({}, { get: () => (_req, _res, next) => next() }));

describe("route modüllerinde sarmalanmamış async handler yok", () => {
  const { ROUTE_MOUNTS } = require("../../backend/scripts/routes/mounts");
  const AsyncFunction = (async () => {}).constructor;

  for (const { file } of ROUTE_MOUNTS) {
    it(file, () => {
      process.env.JWT_SECRET = process.env.JWT_SECRET || "Kq7vR2mZ9xT4pL6wN8bC3dF5hJ1gS0aE7yU2tH6rV9nM4cX8kB5fD3jG1sA0eQ7zW";
      const router = require(`../../backend/scripts/routes/${file}`);
      const bare = [];
      for (const layer of router.stack) {
        const handles = layer.route ? layer.route.stack.map((l) => l.handle) : [layer.handle];
        for (const h of handles) if (h instanceof AsyncFunction) bare.push(layer.route ? layer.route.path : "use");
      }
      expect(bare).toEqual([]);
    });
  }
});
