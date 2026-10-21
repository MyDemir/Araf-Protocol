// B2-17: async route handler reddi süreci düşürmemeli; next(err)'e gitmeli.
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const acorn = require('../../backend/node_modules/acorn');
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

describe('route dosyalarında sarmalanmamış async handler yok', () => {
  const dir = path.join(__dirname, '../../backend/scripts/routes');
  const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'use']);

  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    it(file, () => {
      const ast = acorn.parse(fs.readFileSync(path.join(dir, file), 'utf8'), { ecmaVersion: 2022 });
      const bare = [];
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' &&
            n.callee.object.name === 'router' && VERBS.has(n.callee.property.name)) {
          for (const a of n.arguments) {
            if ((a.type === 'ArrowFunctionExpression' || a.type === 'FunctionExpression') && a.async) bare.push(a.start);
          }
        }
        for (const k in n) if (k !== 'type') walk(n[k]);
      })(ast);
      expect(bare).toEqual([]);
    });
  }
});
