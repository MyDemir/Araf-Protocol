// [TR] K4-01: Base Sepolia'da ESCROW_REGISTRY_GUARD_MODE=enforce yazılıyor ve canlı /ready ile doğrulanıyor.
//      Ağ yok: yerel http sunucusu sahte /ready JSON'u döner. Yalnız sahte değerler.
// [EN] K4-01: Base Sepolia stages ESCROW_REGISTRY_GUARD_MODE=enforce and verifies it via the live /ready.
const { expect } = require('chai');
const { ethers } = require('ethers');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const STAGE = path.join(ROOT, '.github/scripts/stage-runtime-env.sh');
const WF = (f) => fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8');
const A = (n) => ethers.getAddress('0x' + n.toString(16).padStart(40, 'a'));

const BASE_ENV = {
  MONGODB_URI: 'mongodb+srv://dummy', REDIS_URL: 'rediss://dummy', JWT_SECRET: 'j'.repeat(64),
  MASTER_ENCRYPTION_KEY: 'a'.repeat(64), BASE_SEPOLIA_RPC_URL: 'https://rpc.invalid', BASE_SEPOLIA_WS_RPC_URL: 'wss://rpc.invalid',
  ESCROW: A(3), USDT: A(5), USDC: A(6), DEPLOY_BLOCK: '123', FRONTEND_DOMAIN: 'app.example.org',
};

function runAsync(cmd, env) {
  return new Promise((resolve) => {
    const p = spawn('bash', [STAGE, cmd], { env: { PATH: process.env.PATH, ...env } });
    let stdout = ''; let stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function steps(file) {
  const doc = yaml.load(WF(file));
  const job = Object.values(doc.jobs)[0];
  return job.steps.map((s) => ({ name: s.name || '', run: String(s.run || ''), if: String(s.if || '') }));
}
const idx = (list, pred) => list.findIndex(pred);

describe('K4-01: registry guard enforce (Base Sepolia)', function () {
  it('fly-secret-lines writes ESCROW_REGISTRY_GUARD_MODE=enforce exactly once', function () {
    const r = spawnSync('bash', [STAGE, 'fly-secret-lines'], { env: { PATH: process.env.PATH, ...BASE_ENV }, encoding: 'utf8' });
    expect(r.status, r.stderr).to.equal(0);
    const hits = r.stdout.split('\n').filter((l) => l.startsWith('ESCROW_REGISTRY_GUARD_MODE='));
    expect(hits).to.deep.equal(['ESCROW_REGISTRY_GUARD_MODE=enforce']);
  });

  describe('guard-mode command (fake /ready)', function () {
    let server; let base; let reply;
    before(async function () {
      server = http.createServer((req, res) => {
        if (req.url !== '/ready') { res.writeHead(404); return res.end(); }
        res.writeHead(reply.code, { 'content-type': 'application/json' });
        res.end(reply.body);
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => new Promise((r) => server.close(r)));
    const env = () => ({ HEALTH_BASE_URL: base, HEALTH_RETRIES: '1', HEALTH_RETRY_DELAY: '0' });
    const ready = (mode, code = 200, extra = {}) => ({
      code,
      body: JSON.stringify({ ok: code === 200, escrowRegistry: { mode, checked: true, ok: code === 200, reason: null, ...extra }, degraded: false }),
    });

    it('passes when mode is enforce (200)', async function () {
      reply = ready('enforce');
      const r = await runAsync('guard-mode', env());
      expect(r.status, r.stderr).to.equal(0);
      expect(r.stdout).to.include('enforce');
    });

    it('passes when mode is enforce even if /ready is 503 (blocked mismatch is the intended state)', async function () {
      reply = ready('enforce', 503, { reason: 'escrow_mismatch' });
      const r = await runAsync('guard-mode', env());
      expect(r.status, r.stderr).to.equal(0);
    });

    for (const mode of ['warn', 'off']) {
      it(`fails with ::error:: when mode is ${mode}`, async function () {
        reply = ready(mode);
        const r = await runAsync('guard-mode', env());
        expect(r.status).to.equal(1);
        expect(r.stderr).to.match(/::error::.*enforce/);
      });
    }

    it('fails when /ready has no escrowRegistry field', async function () {
      reply = { code: 200, body: '{"ok":true}' };
      const r = await runAsync('guard-mode', env());
      expect(r.status).to.equal(1);
      expect(r.stderr).to.match(/::error::/);
    });

    it('fails when /ready is not JSON / server error', async function () {
      reply = { code: 502, body: 'bad gateway' };
      const r = await runAsync('guard-mode', env());
      expect(r.status).to.equal(1);
      expect(r.stderr).to.match(/::error::/);
    });

    it('fails when the backend is unreachable', async function () {
      const r = await runAsync('guard-mode', { HEALTH_BASE_URL: 'http://127.0.0.1:1', HEALTH_RETRIES: '1', HEALTH_RETRY_DELAY: '0' });
      expect(r.status).to.equal(1);
      expect(r.stderr).to.match(/::error::/);
    });
  });

  describe('workflow wiring', function () {
    const GM = 'stage-runtime-env.sh guard-mode';

    it('deploy-base-sepolia: guard-mode inside the Fly deploy step (ACTIVE, before rotation) and again after health', function () {
      const s = steps('deploy-base-sepolia.yml');
      const fly = idx(s, (x) => x.name === 'Deploy backend to Fly');
      const rot = idx(s, (x) => x.name.startsWith('Rotate escrow state'));
      const health = idx(s, (x) => x.name === 'Check backend health');
      // Rotasyon adımı Fly deploy'a bitişik kalmak zorunda (mevcut testler): ön kontrol Fly deploy adımının içinde.
      expect(rot).to.equal(fly + 1);
      expect(s[fly].run).to.include('guard-mode');
      expect(s[fly].run).to.include('"ACTIVE"');
      expect(s[fly].run.indexOf('flyctl deploy')).to.be.lessThan(s[fly].run.indexOf('guard-mode'));
      const post = idx(s, (x, i) => i > health && x.run.includes(GM));
      expect(post, 'post-health guard-mode').to.be.greaterThan(health);
    });

    it('deploy-runtime-base-sepolia: guard-mode runs after health', function () {
      const s = steps('deploy-runtime-base-sepolia.yml');
      const health = idx(s, (x) => x.name === 'Check backend health');
      const gm = idx(s, (x) => x.run.includes(GM));
      expect(gm).to.be.greaterThan(health);
      expect(s[gm].if).to.include('inputs.deploy_backend');
    });

    it('rotate-escrow: guard-mode runs before rotate/restore apply and after health', function () {
      const s = steps('rotate-escrow.yml');
      const rot = idx(s, (x) => x.name.startsWith('Rotate (complete'));
      const res = idx(s, (x) => x.name === 'Restore archive');
      const health = idx(s, (x) => x.name === 'Check backend health');
      const pre = idx(s, (x) => x.run.includes(GM) && x.name.toLowerCase().includes('before'));
      const post = idx(s, (x, i) => i > health && x.run.includes(GM));
      expect(pre).to.be.greaterThan(-1);
      expect(pre).to.be.lessThan(rot);
      expect(pre).to.be.lessThan(res);
      expect(s[pre].if).to.include('!inputs.dry_run');
      expect(post).to.be.greaterThan(health);
    });
  });
});
