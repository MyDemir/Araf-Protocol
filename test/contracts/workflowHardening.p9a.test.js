// [TR] Dalga 3 P9a: delete-worker-checkpoint.js (K4-11) ve stage-runtime-env.sh (K4-14, K4-05) davranış testleri. Ağ yok, sahte değerler.
// [EN] Wave 3 P9a behavior tests: SELECT on db path, FRONTEND_DOMAIN regex, address distinctness, curl timeouts, no secret in argv.
const { expect } = require('chai');
const { spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const STAGE = path.join(ROOT, '.github/scripts/stage-runtime-env.sh');
const deleter = require('../../.github/scripts/delete-worker-checkpoint.js');

function fakeRedis() {
  const cmds = [];
  const server = net.createServer((s) => {
    s.on('data', (d) => {
      for (const m of d.toString().matchAll(/\*\d+\r\n((?:\$\d+\r\n.*\r\n)+)/g)) {
        const args = m[1].split('\r\n').filter((l, i) => i % 2 === 1);
        cmds.push(args);
        s.write(args[0] === 'DEL' ? `:${args.length - 1}\r\n` : '+OK\r\n');
      }
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, cmds, port: server.address().port })));
}

describe('delete-worker-checkpoint.js: veritabani indeksi (K4-11)', function () {
  let redis;
  beforeEach(async () => { redis = await fakeRedis(); });
  afterEach(() => redis.server.close());
  const env = (p) => ({ REDIS_URL: `redis://default:pw@127.0.0.1:${redis.port}${p}`, ALLOW_PLAIN_REDIS_FOR_TEST: '1' });

  it('/1 yolu: AUTH, SELECT 1, DEL sirasiyla gonderilir', async function () {
    const n = await deleter.run(env('/1'));
    expect(n).to.equal(2);
    expect(redis.cmds.map((c) => c[0])).to.deep.equal(['AUTH', 'SELECT', 'DEL']);
    expect(redis.cmds[1]).to.deep.equal(['SELECT', '1']);
  });

  it('yol yok ya da /0: SELECT gonderilmez', async function () {
    for (const p of ['', '/', '/0']) {
      redis.cmds.length = 0;
      await deleter.run(env(p));
      expect(redis.cmds.map((c) => c[0]), p).to.deep.equal(['AUTH', 'DEL']);
    }
  });

  it('sayisal olmayan yol reddedilir, hicbir komut gitmez', async function () {
    let err;
    try { await deleter.run(env('/abc')); } catch (e) { err = e; }
    expect(err && err.message).to.match(/database/i);
    expect(redis.cmds).to.have.length(0);
  });
});

const A = (n) => '0x' + n.toString(16).padStart(40, 'a');
const BASE = {
  MONGODB_URI: 'mongodb+srv://dummy', REDIS_URL: 'rediss://dummy', JWT_SECRET: 'j'.repeat(64),
  MASTER_ENCRYPTION_KEY: 'a'.repeat(64), BASE_SEPOLIA_RPC_URL: 'https://rpc.invalid', BASE_SEPOLIA_WS_RPC_URL: 'wss://rpc.invalid',
  ESCROW: A(3), USDT: A(5), USDC: A(6), DEPLOY_BLOCK: '123', FRONTEND_DOMAIN: 'app.example.org',
};
const stage = (cmd, env) => spawnSync('bash', [STAGE, cmd], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });

describe('stage-runtime-env.sh: dogrulamalar (K4-14)', function () {
  it('gecerli FRONTEND_DOMAIN bicimleri kabul edilir', function () {
    for (const d of ['app.example.org', 'my-app.vercel.app', 'a.io:8443', 'localhost2']) {
      const r = stage('validate', { ...BASE, FRONTEND_DOMAIN: d });
      expect(r.status, `${d}: ${r.stderr}`).to.equal(0);
    }
  });

  it('bosluk, satir sonu, buyuk harf, https://, yol, bos etiket, localhost reddedilir', function () {
    for (const d of ['app example.org', 'app.example.org\nEVIL=1', 'App.Example.org', 'https://app.example.org', 'app.example.org/x',
      '-app.example.org', 'app.example.org-', 'app.example.org:', 'app.example.org:123456', 'localhost', 'localhost:3000']) {
      const r = stage('validate', { ...BASE, FRONTEND_DOMAIN: d });
      expect(r.status, JSON.stringify(d)).to.equal(1);
      expect(r.stderr, JSON.stringify(d)).to.match(/::error::.*FRONTEND_DOMAIN/);
    }
  });

  it('fly-secret-lines gecersiz FRONTEND_DOMAIN ile satir uretmez (enjeksiyon)', function () {
    const r = stage('fly-secret-lines', { ...BASE, FRONTEND_DOMAIN: 'a.example.org\nEVIL=1' });
    expect(r.status).to.equal(1);
    expect(r.stdout).to.not.include('EVIL=1');
  });

  it('ESCROW, USDT, USDC birbirinden farkli olmali (buyuk/kucuk harf duyarsiz)', function () {
    for (const [a, b] of [['ESCROW', 'USDT'], ['ESCROW', 'USDC'], ['USDT', 'USDC']]) {
      const r = stage('validate', { ...BASE, [b]: BASE[a].toUpperCase().replace('0X', '0x') });
      expect(r.status, `${a}=${b}`).to.equal(1);
      expect(r.stderr).to.match(/::error::.*(differ|distinct)/);
    }
  });

  it('health: curl cagrilarina --connect-timeout ve --max-time verilir', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-curl-'));
    const log = path.join(dir, 'log');
    fs.writeFileSync(path.join(dir, 'curl'), `#!/usr/bin/env bash\necho "$*" >> "${log}"\nfor a in "$@"; do if [ "$prev" = "--output" ]; then : > "$a"; fi; prev="$a"; done\n[[ "$*" == *--write-out* ]] && printf 200\nexit 0\n`, { mode: 0o755 });
    const r = stage('health', { ...BASE, FLY_APP_NAME: 'app', HEALTH_INITIAL_SLEEP: '0', PATH: `${dir}:${process.env.PATH}` });
    expect(r.status, r.stderr).to.equal(0);
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    expect(calls).to.have.length(2);
    for (const c of calls) expect(c).to.match(/--connect-timeout \d+/).and.to.match(/--max-time \d+/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('stage-runtime-env.sh: VERCEL_TOKEN argv disinda (K4-05)', function () {
  it('vercel pull/deploy argumanlarinda token yok; env ile ulasir', function () {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-vercel-'));
    const log = path.join(dir, 'log');
    fs.writeFileSync(path.join(dir, 'vercel'), `#!/usr/bin/env bash\necho "ARGS:$* TOKENENV:\${VERCEL_TOKEN:-}" >> "${log}"\n`, { mode: 0o755 });
    const r = stage('vercel-deploy', { ...BASE, VERCEL_TOKEN: 'tok_secret_vercel', PATH: `${dir}:${process.env.PATH}` });
    expect(r.status, r.stderr).to.equal(0);
    const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    expect(calls).to.have.length(2);
    for (const c of calls) {
      expect(c.split(' TOKENENV:')[0]).to.not.match(/tok_secret_vercel|--token/);
      expect(c).to.include('TOKENENV:tok_secret_vercel');
    }
    expect(`${r.stdout}${r.stderr}`).to.not.include('tok_secret_vercel');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('lib/redact.js (K4-10)', function () {
  const { redactError } = require('../../.github/scripts/lib/redact.js');
  it('URL, anahtar benzeri dizgi ve satir sonu maskelenir; ham nesne basilmaz', function () {
    const e = new Error('request failed https://base-sepolia.g.alchemy.com/v2/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345 and key ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n::error::injected');
    e.code = 'SERVER_ERROR';
    e.request = { url: 'https://secret.example/key123' };
    const out = redactError(e);
    expect(out).to.match(/^Error \(SERVER_ERROR\): /);
    expect(out).to.not.match(/alchemy|ABCDEFGHIJKLMNOP|secret\.example|\n/);
    expect(out).to.include('[redacted-url]');
  });
  it('0x + 40 hex adres korunur; 0x + 64 hex maskelenir; adres yaninda uzun anahtar yine maskelenir', function () {
    const { redactText } = require('../../.github/scripts/lib/redact.js');
    const addr = '0x' + 'ab'.repeat(20);
    const key = '0x' + 'cd'.repeat(32);
    expect(redactText(`escrow ${addr} failed`)).to.equal(`escrow ${addr} failed`);
    expect(redactText(`pk ${key}`)).to.equal('pk [redacted-hex]');
    expect(redactText(`${addr} ${'A1b2'.repeat(10)}`)).to.equal(`${addr} [redacted]`);
    expect(redactText(`0x${'ab'.repeat(21)}`)).to.include('[redacted]');
  });
  it('workflow Export adimi redactError kullanir ve e.message dogrudan basilmaz', function () {
    const wf = require('js-yaml').load(fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-base-sepolia.yml'), 'utf8'));
    const run = wf.jobs.deploy.steps.find((s) => s.name === 'Export deployment values').run;
    expect(run).to.include('redact.js').and.to.include('redactError(e)');
    expect(run).to.not.include('e.message');
  });
});

describe('escrow-registry.js write filtresi (K4-20a)', function () {
  const Module = require('module');
  it('ROTATING belgeyi ezmez: filtre state $ne ROTATING; 11000 guvenli hataya cevrilir', async function () {
    const resolved = require.resolve('mongodb', { paths: [path.join(ROOT, 'backend')] });
    const saved = require.cache[resolved];
    const calls = [];
    let failWith = null;
    class FakeClient {
      constructor() {}
      async connect() {}
      async close() {}
      db() { return { collection: () => ({ replaceOne: async (...a) => { calls.push(a); if (failWith) throw failWith; } }) }; }
    }
    require.cache[resolved] = new Module(resolved);
    require.cache[resolved].exports = { MongoClient: FakeClient };
    require.cache[resolved].loaded = true;
    try {
      const { createMongoStore } = require('../../.github/scripts/escrow-registry.js');
      const store = createMongoStore('mongodb://x');
      await store.write({ _id: 'active', state: 'ACTIVE' });
      expect(calls[0][0]).to.deep.equal({ _id: 'active', state: { $ne: 'ROTATING' } });
      expect(calls[0][2]).to.deep.equal({ upsert: true });
      failWith = Object.assign(new Error('E11000 dup key host=secret'), { code: 11000 });
      let err;
      try { await store.write({ _id: 'active' }); } catch (e) { err = e; }
      expect(err.safe).to.equal(true);
      expect(err.message).to.match(/ROTATING/).and.to.not.match(/secret/);
    } finally {
      if (saved) require.cache[resolved] = saved; else delete require.cache[resolved];
    }
  });
});

describe('workflow YAML sertlestirmeleri (K4-03/04/08/09/20d)', function () {
  const yaml = require('js-yaml');
  const load = (f) => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));
  const deploySteps = () => load('deploy-base-sepolia.yml').jobs.deploy.steps;
  const idx = (steps, n) => steps.findIndex((s) => s.name === n);

  it('K4-03: verify adimi health kontrolunden sonra, kendi timeout ve ust sinirlariyla', function () {
    const steps = deploySteps();
    const v = steps[idx(steps, 'Verify contracts on BaseScan (experimental)')];
    expect(idx(steps, 'Verify contracts on BaseScan (experimental)')).to.be.greaterThan(idx(steps, 'Check backend health'));
    expect(v['timeout-minutes']).to.be.a('number').and.to.be.at.most(15);
    expect(Number(v.env.VERIFY_RETRIES)).to.be.at.most(3);
    expect(Number(v.env.VERIFY_RETRY_DELAY_MS)).to.be.at.most(15000);
  });

  it('K4-04: Persist yalniz rotasyon/ilk-kurulum registry adimi basarili olunca; always() yok; ozet OLD_ESCROW_ADDRESS yazar', function () {
    const steps = deploySteps();
    const p = steps[idx(steps, 'Persist deployment variables')];
    expect(p.if).to.not.include('always()');
    expect(p.if).to.include("steps.rotate_state.outcome == 'success'").and.to.include("steps.registry_first.outcome == 'success'");
    expect(steps.find((s) => s.id === 'rotate_state').name).to.equal('Rotate escrow state (archive + registry switch)');
    expect(steps.find((s) => s.id === 'registry_first').name).to.equal('Write active escrow registry (first install)');
    const sum = steps[idx(steps, 'Print deployment summary')];
    expect(sum.env.OLD_ESCROW_ADDRESS).to.equal('${{ vars.ARAF_ESCROW_ADDRESS }}');
    expect(sum.run).to.include('OLD_ESCROW_ADDRESS');
  });

  it('K4-08: ci.yml permissions contents read + concurrency + timeout; release CI basarisini ister', function () {
    const ci = load('ci.yml');
    expect(ci.permissions).to.deep.equal({ contents: 'read' });
    expect(ci.concurrency['cancel-in-progress']).to.equal(true);
    for (const j of Object.values(ci.jobs)) expect(j['timeout-minutes']).to.be.a('number');
    const rel = load('release.yml');
    const steps = rel.jobs.release.steps;
    const gate = steps.findIndex((s) => s.name === 'Require successful CI for this commit');
    expect(gate).to.be.greaterThan(-1);
    expect(gate).to.be.lessThan(steps.findIndex((s) => s.name === 'Publish release'));
    expect(steps[gate].run).to.include('workflows/ci.yml/runs').and.to.include('head_sha=$GITHUB_SHA').and.to.include('status=success');
    expect(rel.permissions.actions).to.equal('read');
  });

  it('K4-09: GH_VARIABLES_TOKEN hardhat adiminda yok; ayri adimda', function () {
    const steps = deploySteps();
    const h = steps[idx(steps, 'Deploy test USDT (optional)')];
    expect(JSON.stringify(h)).to.not.include('GH_VARIABLES_TOKEN');
    expect(h.run).to.not.include('gh variable');
    const p = steps[idx(steps, 'Persist test USDT variable (optional)')];
    expect(p.env.GH_TOKEN).to.equal('${{ secrets.GH_VARIABLES_TOKEN }}');
    expect(p.run).to.not.include('hardhat');
    for (const s of steps) if (s.run && s.run.includes('hardhat')) expect(JSON.stringify(s.env || {}), s.name).to.not.include('GH_VARIABLES_TOKEN');
  });

  it('K4-20d: rotate-escrow.yml contracts npm ci adimi yok', function () {
    for (const s of load('rotate-escrow.yml').jobs.rotate.steps) expect(s['working-directory'], s.name).to.not.equal('contracts');
  });
});

describe('action sabitleme (K4-06)', function () {
  const dir = path.join(ROOT, '.github/workflows');
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

  it('her uses: 40 haneli commit SHA + surum yorumu tasir', function () {
    let n = 0;
    for (const f of files) {
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
        const m = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/);
        if (!m) continue;
        n += 1;
        expect(m[1], `${f}: ${line}`).to.match(/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/);
        expect(m[2], `${f}: ${line}`).to.match(/^\s+#\s*v?\d+(\.\d+)*\s*$/);
      }
    }
    expect(n).to.be.greaterThan(10);
  });

  it('setup-flyctl adimlari sabit surum alir (latest degil)', function () {
    const yaml = require('js-yaml');
    let n = 0;
    for (const f of files) {
      const wf = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const job of Object.values(wf.jobs)) {
        for (const s of job.steps || []) {
          if (s.uses && s.uses.includes('setup-flyctl')) {
            n += 1;
            expect(s.with && s.with.version, `${f}: ${s.name}`).to.match(/^\d+\.\d+\.\d+$/);
          }
        }
      }
    }
    expect(n).to.equal(3);
  });
});

describe('fly-machines-lib.sh: capture_started gecis durumlari (K4-13)', function () {
  const LIB = path.join(ROOT, '.github/scripts/fly-machines-lib.sh');
  function capture(states, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p9a-fly-'));
    const json = JSON.stringify(Object.entries(states).map(([id, state]) => ({ id, state })));
    fs.writeFileSync(path.join(dir, 'flyctl'), `#!/usr/bin/env bash\necho '${json}'\n`, { mode: 0o755 });
    const r = spawnSync('bash', ['-c', `source "${LIB}"; capture_started; echo "IDS=\${IDS[*]:-}"`], {
      env: { PATH: `${dir}:${process.env.PATH}`, FLY_APP_NAME: 'app', WAIT_TIMEOUT_S: '0', WAIT_INTERVAL_S: '0', ...extra }, encoding: 'utf8',
    });
    fs.rmSync(dir, { recursive: true, force: true });
    return r;
  }

  it('started, starting ve replacing yakalanir; stopped ve suspended yakalanmaz', function () {
    const r = capture({ a: 'started', b: 'starting', c: 'replacing', d: 'stopped', e: 'suspended' });
    expect(r.status, r.stderr).to.equal(0);
    expect(r.stdout.trim()).to.equal('IDS=a b c');
  });
});
