// [TR] .github/scripts/escrow-registry.js: sahte Mongo deposu (enjekte), ağ yok, sahte değerler.
// [EN] escrow-registry.js with an injected fake store. No network, dummy values only.
const { expect } = require('chai');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, '.github/scripts/escrow-registry.js');
const { run } = require('../../.github/scripts/escrow-registry.js');

const URI = 'mongodb+srv://dbuser:Sup3rSecretPw@cluster0.example.mongodb.net/araf';
const ADDR = '0x' + 'aB'.repeat(20);
const OTHER = '0x' + 'cd'.repeat(20);
const ENV = { MONGODB_URI: URI, ARAF_ESCROW_ADDRESS: ADDR, EXPECTED_CHAIN_ID: '84532', ARAF_DEPLOYMENT_BLOCK: '48101694', GITHUB_RUN_ID: '123456789' };

function fakeStore(initial = null, { failRead = false, failWrite = false } = {}) {
  const st = { doc: initial, writes: [], reads: 0, closed: 0 };
  st.read = async () => {
    st.reads += 1;
    if (failRead) throw Object.assign(new Error(`connect failed to ${URI}`), { name: 'MongoServerSelectionError' });
    return st.doc;
  };
  st.write = async (d) => {
    if (failWrite) throw new Error(`write failed ${URI}`);
    st.writes.push(d);
    st.doc = d;
  };
  st.close = async () => { st.closed += 1; };
  return st;
}

async function exec(argv, { env = ENV, store } = {}) {
  const lines = [];
  const code = await run({ argv, env, store, out: (l) => lines.push(String(l)) });
  return { code, out: lines.join('\n') };
}

const active = (over = {}) => ({ _id: 'active', escrow_address: ADDR.toLowerCase(), chain_id: 84532, deploy_block: 1, state: 'ACTIVE', since: new Date('2026-01-01'), updated_by: 'x', ...over });

describe('escrow-registry.js --adopt', () => {
  it('without --adopt prints usage and exits 2 without touching the store', async () => {
    const store = fakeStore();
    const r = await exec([], { store });
    expect(r.code).to.equal(2);
    expect(store.reads).to.equal(0);
    expect((await exec(['--adopt', '--bogus'], { store })).code).to.equal(2);
  });

  it('DEFAULT is dry-run: reads, prints the plan, writes nothing', async () => {
    const store = fakeStore();
    const r = await exec(['--adopt'], { store });
    expect(r.code).to.equal(0);
    expect(store.writes).to.have.length(0);
    expect(r.out).to.include('DRY-RUN');
    expect(r.out).to.include(ADDR.toLowerCase());
    expect(r.out).to.include('github-run-123456789');
  });

  it('--apply creates the active document (lowercase address, ACTIVE, run id)', async () => {
    const store = fakeStore();
    const r = await exec(['--adopt', '--apply'], { store });
    expect(r.code).to.equal(0);
    expect(store.writes).to.have.length(1);
    expect(store.writes[0]).to.include({ _id: 'active', escrow_address: ADDR.toLowerCase(), chain_id: 84532, deploy_block: 48101694, state: 'ACTIVE', updated_by: 'github-run-123456789' });
    expect(store.writes[0].since).to.be.instanceOf(Date);
  });

  it('--apply on the same escrow is idempotent and keeps `since`', async () => {
    const store = fakeStore(active());
    const r = await exec(['--adopt', '--apply'], { store });
    expect(r.code).to.equal(0);
    expect(store.writes[0].since.toISOString()).to.equal('2026-01-01T00:00:00.000Z');
  });

  it('different active escrow without --force-switch STOPS (dry-run and apply), nothing written', async () => {
    for (const argv of [['--adopt'], ['--adopt', '--apply']]) {
      const store = fakeStore(active({ escrow_address: OTHER }));
      const r = await exec(argv, { store });
      expect(r.code).to.equal(1);
      expect(r.out).to.include('--force-switch');
      expect(store.writes).to.have.length(0);
    }
  });

  it('different chain or ROTATING state also stops without --force-switch', async () => {
    for (const over of [{ chain_id: 1 }, { state: 'ROTATING' }]) {
      const store = fakeStore(active(over));
      const r = await exec(['--adopt', '--apply'], { store });
      expect(r.code).to.equal(1);
      expect(store.writes).to.have.length(0);
    }
  });

  it('--force-switch --apply replaces a different active escrow; without --apply it still writes nothing', async () => {
    const dry = fakeStore(active({ escrow_address: OTHER }));
    expect((await exec(['--adopt', '--force-switch'], { store: dry })).code).to.equal(0);
    expect(dry.writes).to.have.length(0);

    const store = fakeStore(active({ escrow_address: OTHER }));
    const r = await exec(['--adopt', '--apply', '--force-switch'], { store });
    expect(r.code).to.equal(0);
    expect(store.writes[0].escrow_address).to.equal(ADDR.toLowerCase());
  });

  it('invalid inputs stop before any store access', async () => {
    const bad = [
      { ARAF_ESCROW_ADDRESS: '0x123' },
      { ARAF_ESCROW_ADDRESS: '0x' + 'g'.repeat(40) },
      { ARAF_ESCROW_ADDRESS: '0x' + '0'.repeat(40) },
      { ARAF_ESCROW_ADDRESS: ADDR + ' ; rm' },
      { ARAF_ESCROW_ADDRESS: '' },
      { EXPECTED_CHAIN_ID: 'abc' },
      { EXPECTED_CHAIN_ID: '0' },
      { EXPECTED_CHAIN_ID: '' },
      { ARAF_DEPLOYMENT_BLOCK: '-1' },
      { ARAF_DEPLOYMENT_BLOCK: '' },
      { GITHUB_RUN_ID: 'abc;id' },
    ];
    for (const over of bad) {
      const store = fakeStore();
      const r = await exec(['--adopt', '--apply'], { env: { ...ENV, ...over }, store });
      expect(r.code, JSON.stringify(over)).to.equal(1);
      expect(store.reads, JSON.stringify(over)).to.equal(0);
      expect(store.writes).to.have.length(0);
    }
  });

  it('never prints the Mongo URI or password (success, refusal and Mongo errors)', async () => {
    const outs = [];
    outs.push((await exec(['--adopt', '--apply'], { store: fakeStore() })).out);
    outs.push((await exec(['--adopt', '--apply'], { store: fakeStore(active({ escrow_address: OTHER })) })).out);
    outs.push((await exec(['--adopt', '--apply'], { store: fakeStore(null, { failRead: true }) })).out);
    outs.push((await exec(['--adopt', '--apply'], { store: fakeStore(null, { failWrite: true }) })).out);
    for (const o of outs) {
      expect(o).to.not.include('Sup3rSecretPw');
      expect(o).to.not.include('mongodb+srv');
      expect(o).to.not.include('cluster0');
    }
    expect(outs[2]).to.include('MongoServerSelectionError');
  });

  it('CLI: invalid address exits 1 and does not echo the URI (no Mongo needed)', () => {
    const r = spawnSync('node', [SCRIPT, '--adopt', '--apply'], { env: { PATH: process.env.PATH, ...ENV, ARAF_ESCROW_ADDRESS: 'nope' }, encoding: 'utf8' });
    expect(r.status).to.equal(1);
    expect(r.stdout + r.stderr).to.not.include('Sup3rSecretPw');
    const u = spawnSync('node', [SCRIPT], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
    expect(u.status).to.equal(2);
  });
});
