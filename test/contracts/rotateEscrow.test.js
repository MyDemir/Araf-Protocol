// [TR] .github/scripts/rotate-escrow.js: sahte Mongo/Redis/RPC (enjekte), ağ yok, sahte değerler.
// [EN] rotate-escrow.js with injected in-memory Mongo/Redis/chain fakes. No network, dummy values only.
const { expect } = require('chai');
const path = require('path');

const mod = require('../../.github/scripts/rotate-escrow.js');
const { run, archiveName, canonicalJson, pickMirror, isDefaultMirror, mirrorDefaults, moveCollection, COLLECTIONS, ARCHIVE_NAME_RE } = mod;

const F = require('./helpers/rotateEscrowFakes.js');
const { URI, REDIS, RPC, OLD, NEW, CHAIN, AID, ENV, clone, fakeMongo, fakeRedis, fakeChain, T0, active, wallet, mkUsers, mkColls, world } = F;

async function exec(argv, { env = ENV, mongo, redis, chain } = {}) {
  const lines = [];
  const deps = { mongo, redis, chain: chain === undefined ? fakeChain() : chain };
  const code = await run({ argv, env, deps, out: (l) => lines.push(String(l)), now: () => T0 });
  return { code, out: lines.join('\n') };
}

describe('rotate-escrow.js helpers', () => {
  it('archive naming is strict', () => {
    const n = archiveName(CHAIN, OLD.toUpperCase().replace('0X', '0x'), 'trades');
    expect(n).to.equal(`archive_84532_${OLD}_trades`);
    expect(ARCHIVE_NAME_RE.test(n)).to.equal(true);
    expect(() => archiveName(CHAIN, OLD, 'Trades')).to.throw();
    expect(() => archiveName(CHAIN, '0x12', 'trades')).to.throw();
    expect(ARCHIVE_NAME_RE.test(`archive_1_${OLD}_trades; drop`)).to.equal(false);
  });

  it('collection names are the real mongoose names', () => {
    const models = path.resolve(__dirname, '../../backend/scripts/models');
    const names = ['Order', 'Trade', 'TerminalTradeStat', 'RevenueEvent', 'RewardEpoch', 'RewardClaim', 'RewardFunding', 'RewardEpochAllocationEvent'];
    let real;
    try { real = names.map((n) => require(path.join(models, n)).collection.name); } catch { return; }
    expect(real.sort()).to.deep.equal([...COLLECTIONS].sort());
  });

  it('canonical hash ignores _archive and key order but not content', () => {
    const a = { _id: 1, x: 1, y: { b: 2, a: [1, { q: 1, p: 2 }] }, d: new Date('2026-01-01') };
    const b = { d: new Date('2026-01-01'), y: { a: [1, { p: 2, q: 1 }], b: 2 }, x: 1, _id: 1, _archive: { id: 'z' } };
    expect(canonicalJson(a)).to.equal(canonicalJson(b));
    expect(canonicalJson({ ...a, x: 2 })).to.not.equal(canonicalJson(a));
    expect(canonicalJson({ _id: 1, s: '2026-01-01T00:00:00.000Z' })).to.not.equal(canonicalJson({ _id: 1, s: new Date('2026-01-01') }));
  });

  it('payout_profile never enters the mirror subset', () => {
    const u = mkUsers()[0];
    const p = pickMirror(u);
    expect(p).to.not.have.property('payout_profile');
    expect(JSON.stringify(p)).to.not.include('SECRET-IBAN');
    expect(Object.keys(p).every((k) => mod.MIRROR_FIELDS.includes(k))).to.equal(true);
    expect(isDefaultMirror(mkUsers()[1])).to.equal(true);
    expect(isDefaultMirror(u)).to.equal(false);
  });

  it('mirror defaults equal the User schema defaults', () => {
    let User;
    try { User = require(path.resolve(__dirname, '../../backend/scripts/models/User.js')); } catch { return; }
    const doc = new User({ wallet_address: wallet(9) }).toObject();
    const d = mirrorDefaults();
    for (const f of mod.MIRROR_FIELDS) expect(JSON.parse(JSON.stringify(doc[f])), f).to.deep.equal(JSON.parse(JSON.stringify(d[f])));
  });
});

describe('moveCollection decision table', () => {
  const base = async (srcDocs, dstDocs, recs = {}) => {
    const colls = {};
    if (srcDocs) colls.orders = srcDocs;
    if (dstDocs) colls.dst = dstDocs;
    const mongo = fakeMongo({ colls });
    const ctx = { mongo, out: () => {}, apply: true };
    return { mongo, ctx, recs, persist: async () => {} };
  };
  it('source only -> moves and verifies', async () => {
    const { mongo, ctx, recs, persist } = await base([{ _id: 1 }], null);
    const r = await moveCollection(ctx, recs, 'orders', 'orders', 'dst', { stamp: { id: 's' }, persist });
    expect(r.status).to.equal('DONE');
    expect(mongo.st.colls.dst.docs[0]._archive).to.deep.equal({ id: 's' });
    expect(mongo.st.colls.orders).to.equal(undefined);
  });
  it('target only (with manifest pre) -> already moved, verified', async () => {
    const { mongo, ctx, persist } = await base(null, [{ _id: 1, _archive: { id: 's' } }]);
    const pre = await (async () => { const { hashCollection } = mod; const h = await hashCollection(mongo, 'dst'); return { count: h.count, sha256: h.sha256, index_specs: await mongo.listIndexSpecs('dst') }; })();
    const r = await moveCollection(ctx, { orders: { pre, status: 'PRE' } }, 'orders', 'orders', 'dst', { stamp: { id: 's' }, persist });
    expect(r.status).to.equal('DONE');
    expect(mongo.st.writes.filter((x) => x.startsWith('rename'))).to.have.length(0);
  });
  it('target only without manifest proof -> conflict', async () => {
    const { ctx, persist } = await base(null, [{ _id: 1 }]);
    let err; try { await moveCollection(ctx, {}, 'orders', 'orders', 'dst', { persist }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/CONFLICT/);
  });
  it('both filled -> stops', async () => {
    const { ctx, persist } = await base([{ _id: 1 }], [{ _id: 2 }]);
    let err; try { await moveCollection(ctx, {}, 'orders', 'orders', 'dst', { persist }); } catch (e) { err = e; }
    expect(err && err.message).to.match(/CONFLICT/);
  });
  it('neither -> ABSENT, nothing moved', async () => {
    const { mongo, ctx, persist } = await base(null, null);
    const r = await moveCollection(ctx, {}, 'orders', 'orders', 'dst', { persist });
    expect(r.status).to.equal('ABSENT');
    expect(mongo.st.writes).to.have.length(0);
  });
});

describe('rotate-escrow.js --precheck', () => {
  it('passes on a healthy paused escrow with no open records', async () => {
    const w = world();
    const r = await exec(['--precheck'], w);
    expect(r.code).to.equal(0);
    expect(r.out).to.include('open-record source: chain-multicall');
    expect(r.out).to.include('rename probe: ok');
  });
  it('fails when registry points elsewhere / chain differs / new equals old', async () => {
    const w = world({ registry: { active: active({ escrow_address: NEW }) } });
    expect((await exec(['--precheck'], w)).code).to.equal(1);
    const w2 = world({ registry: { active: active({ chain_id: 1 }) } });
    expect((await exec(['--precheck'], w2)).code).to.equal(1);
    const w3 = world({ registry: {} });
    expect((await exec(['--precheck'], w3)).code).to.equal(1);
    const same = await exec(['--precheck'], { ...world(), });
    expect(same.code).to.equal(0);
    expect((await exec(['--precheck'], { ...world() }, { env: ENV })).code).to.equal(0);
    expect((await exec(['--precheck'], { ...world(), env: { ...ENV, ARAF_ESCROW_ADDRESS: OLD } })).code).to.equal(1);
  });
  it('open trades AND orders gate: fails without CONFIRM, lists ids, passes with YES', async () => {
    const chain = fakeChain({ trades: [4, 1, 5, 2], orders: [0, 2, 1] });
    const r = await exec(['--precheck'], { ...world(), chain });
    expect(r.code).to.equal(1);
    expect(r.out).to.include('open trades (LOCKED/PAID/CHALLENGED): 2 ids=2,4');
    expect(r.out).to.include('open orders (OPEN/PARTIALLY_FILLED): 2 ids=1,3');
    const ok = await exec(['--precheck'], { ...world(), chain, env: { ...ENV, CONFIRM_ARCHIVE_ACTIVE_TRADES: 'YES' } });
    expect(ok.code).to.equal(0);
  });
  it('RPC_URL is mandatory for --precheck (pause cannot be read otherwise)', async () => {
    const env = { ...ENV }; delete env.RPC_URL;
    const r = await exec(['--precheck'], { ...world(), chain: null, env });
    expect(r.code).to.equal(1);
    expect(r.out).to.include('RPC_URL is required');
  });
  it('ARAF_ESCROW_ADDRESS / ARAF_DEPLOYMENT_BLOCK are optional in --precheck and the skip is stated', async () => {
    const env = { ...ENV }; delete env.ARAF_ESCROW_ADDRESS; delete env.ARAF_DEPLOYMENT_BLOCK;
    const r = await exec(['--precheck'], { ...world(), env });
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.include('new escrow not yet known; skipped');
  });
  it('when ARAF_ESCROW_ADDRESS is given in --precheck, new==old fails and a manifest for another new escrow fails', async () => {
    expect((await exec(['--precheck'], { ...world(), env: { ...ENV, ARAF_ESCROW_ADDRESS: OLD } })).code).to.equal(1);
    const w = world({ registry: { active: active(), [AID]: { _id: AID, new_escrow: `0x${'ee'.repeat(20)}`, state: 'PLANNED' } } });
    const r = await exec(['--precheck'], w);
    expect(r.code).to.equal(1);
    expect(r.out).to.include('DIFFERENT new escrow');
  });
  it('rotate dry-run without RPC_URL counts from the Mongo mirror and says so', async () => {
    const w = world();
    w.mongo.st.mirrorOpen = { trades: ['9'], orders: ['3', '1'] };
    const env = { ...ENV, CONFIRM_ARCHIVE_ACTIVE_TRADES: 'YES' }; delete env.RPC_URL;
    const r = await exec(['--rotate'], { ...w, chain: null, env });
    expect(r.out).to.include('open-record source: mongo-mirror');
    expect(r.out).to.include('ids=1,3');
    expect(w.mongo.st.writes).to.have.length(0);
  });
  it('fails when the contract is not paused', async () => {
    const r = await exec(['--precheck'], { ...world(), chain: fakeChain({ paused: false }) });
    expect(r.code).to.equal(1);
    expect(r.out).to.include('NOT paused');
  });
  it('fails when rename probe fails (points to copy mode) or dbStats lacks fields', async () => {
    const w = world(); w.mongo.st.probeOk = false;
    const r = await exec(['--precheck'], w);
    expect(r.code).to.equal(1);
    expect(r.out).to.include('copy mode');
    const w2 = world(); w2.mongo.st.stats = { dataSize: 1 };
    expect((await exec(['--precheck'], w2)).code).to.equal(1);
  });
});

describe('rotate-escrow.js guards', () => {
  it('refuses to start when MASTER_ENCRYPTION_KEY or JWT_SECRET is present', async () => {
    for (const k of ['MASTER_ENCRYPTION_KEY', 'JWT_SECRET']) {
      const w = world();
      const r = await exec(['--rotate', '--apply'], { ...w, env: { ...ENV, [k]: 'hunter2-value' } });
      expect(r.code).to.equal(1);
      expect(r.out).to.include(k);
      expect(r.out).to.not.include('hunter2-value');
      expect(w.mongo.st.writes).to.have.length(0);
    }
  });
  it('usage errors exit 2', async () => {
    expect((await exec([], world())).code).to.equal(2);
    expect((await exec(['--rotate', '--precheck'], world())).code).to.equal(2);
    expect((await exec(['--precheck', '--apply'], world())).code).to.equal(2);
  });
  it('never prints secrets even when drivers throw them', async () => {
    const w = world(); w.mongo.st.failRename = 'orders';
    const r = await exec(['--rotate', '--apply'], w);
    expect(r.code).to.equal(1);
    for (const s of ['Sup3rSecretPw', 'RedisSecretPw', 'KEY_SECRET_123', 'SECRET-IBAN', 'CIPHER']) expect(r.out).to.not.include(s);
  });
});

describe('rotate-escrow.js --rotate', () => {
  it('DEFAULT is dry-run: writes nothing anywhere', async () => {
    const w = world();
    const before = JSON.stringify([...w.redis.st.kv]);
    const r = await exec(['--rotate'], w);
    expect(r.code).to.equal(0);
    expect(r.out).to.include('DRY-RUN');
    expect(w.mongo.st.writes).to.have.length(0);
    expect(w.redis.st.writes).to.have.length(0);
    expect(JSON.stringify([...w.redis.st.kv])).to.equal(before);
    expect(w.mongo.st.registry.active.state).to.equal('ACTIVE');
    expect(w.mongo.st.registry[AID]).to.equal(undefined);
  });

  it('refuses with open records unless CONFIRM_ARCHIVE_ACTIVE_TRADES=YES', async () => {
    const w = world();
    const chain = fakeChain({ trades: [1], orders: [] });
    const r = await exec(['--rotate', '--apply'], { ...w, chain });
    expect(r.code).to.equal(1);
    expect(w.mongo.st.writes).to.have.length(0);
    const ok = await exec(['--rotate', '--apply'], { ...w, chain, env: { ...ENV, CONFIRM_ARCHIVE_ACTIVE_TRADES: 'YES' } });
    expect(ok.code).to.equal(0);
    expect(w.mongo.st.registry[AID].open_records.trade_count).to.equal(1);
  });

  it('full apply: VERIFIED, archived with Date stamp, users reset, redis moved, checkpoints recorded then deleted', async () => {
    const w = world();
    const r = await exec(['--rotate', '--apply'], w);
    expect(r.code, r.out).to.equal(0);
    const m = w.mongo.st.registry[AID];
    expect(m.state).to.equal('VERIFIED');
    expect(Object.keys(m.steps)).to.have.members(['PLANNED', 'MONGO_DONE', 'USERS_DONE', 'REDIS_DONE', 'ACTIVE_SWITCHED', 'VERIFIED']);
    const act = w.mongo.st.registry.active;
    expect(act).to.include({ escrow_address: NEW, state: 'ACTIVE', deploy_block: 200 });
    for (const c of COLLECTIONS) {
      expect(w.mongo.st.colls[c], c).to.equal(undefined);
    }
    const arch = w.mongo.st.colls[archiveName(CHAIN, OLD, 'orders')].docs;
    expect(arch).to.have.length(2);
    for (const d of arch) {
      expect(d._archive.archived_at).to.be.instanceOf(Date);
      expect(d._archive).to.include({ id: AID, escrow_address: OLD, chain_id: CHAIN });
    }
    expect(m.collections.orders.pre.count).to.equal(2);
    // users
    const u1 = w.mongo.st.users.find((u) => u._id === 'u1');
    expect(isDefaultMirror(u1)).to.equal(true);
    expect(u1.payout_profile.iban_enc).to.equal('SECRET-IBAN-CIPHER');
    const mir = w.mongo.st.colls[archiveName(CHAIN, OLD, 'user_chain_mirror')].docs;
    expect(mir).to.have.length(1);
    expect(mir[0].mirror.is_banned).to.equal(true);
    expect(JSON.stringify(mir)).to.not.include('SECRET-IBAN');
    expect(mir[0].archived_at).to.be.instanceOf(Date);
    // redis
    const kv = w.redis.st.kv;
    expect(kv.has('worker:last_block')).to.equal(false);
    expect(kv.has('worker:dlq')).to.equal(false);
    expect(kv.get(`worker:dlq:archived:${CHAIN}:${OLD}:live`)).to.equal('x');
    expect(kv.get(`cache:protocol_config:v3:last_known:archived:${CHAIN}:${OLD}`)).to.equal('cfg');
    expect(m.redis.checkpoints).to.deep.equal({ 'worker:last_block': '150', 'worker:last_safe_block': '140' });
    // registry went ROTATING first
    expect(w.mongo.st.writes.indexOf('set active')).to.be.lessThan(w.mongo.st.writes.indexOf(`insert ${AID}`));
    // idempotent re-run
    const again = await exec(['--rotate', '--apply'], w);
    expect(again.code).to.equal(0);
  });

  it('crash mid-way (redis down) then re-run resumes and keeps recorded checkpoints', async () => {
    const w = world();
    w.redis.st.failRenameAt = 2;
    const r1 = await exec(['--rotate', '--apply'], w);
    expect(r1.code).to.equal(1);
    let m = w.mongo.st.registry[AID];
    expect(m.state).to.equal('USERS_DONE');
    expect(w.mongo.st.registry.active.escrow_address).to.equal(OLD);
    expect(w.mongo.st.registry.active.state).to.equal('ROTATING');
    expect(w.redis.st.kv.has('worker:last_block')).to.equal(true);
    w.redis.st.failRenameAt = null;
    const r2 = await exec(['--rotate', '--apply'], w);
    expect(r2.code, r2.out).to.equal(0);
    m = w.mongo.st.registry[AID];
    expect(m.state).to.equal('VERIFIED');
    expect(m.redis.checkpoints['worker:last_block']).to.equal('150');
    expect(w.mongo.st.writes.filter((x) => x.startsWith('rename orders'))).to.have.length(1);
  });

  it('crash between rename and verification resumes without re-renaming', async () => {
    const w = world();
    w.mongo.st.failRename = 'trades';
    const r1 = await exec(['--rotate', '--apply'], w);
    expect(r1.code).to.equal(1);
    expect(w.mongo.st.registry[AID].state).to.equal('PLANNED');
    expect(w.mongo.st.registry.active.escrow_address).to.equal(OLD);
    w.mongo.st.failRename = null;
    const r2 = await exec(['--rotate', '--apply'], w);
    expect(r2.code, r2.out).to.equal(0);
    expect(w.mongo.st.writes.filter((x) => x === 'rename orders')).to.have.length(1);
  });

  it('hash mismatch after rename -> no commit point', async () => {
    const w = world();
    w.mongo.st.corruptAfterRename = true;
    const r = await exec(['--rotate', '--apply'], w);
    expect(r.code).to.equal(1);
    expect(r.out).to.include('VERIFY FAILED');
    expect(w.mongo.st.registry.active.escrow_address).to.equal(OLD);
    expect(w.mongo.st.registry[AID].state).to.equal('PLANNED');
  });

  it('both sides filled -> stops, nothing committed', async () => {
    const colls = mkColls();
    colls[archiveName(CHAIN, OLD, 'orders')] = [{ _id: 99 }];
    const w = world({ colls });
    const r = await exec(['--rotate', '--apply'], w);
    expect(r.code).to.equal(1);
    expect(r.out).to.include('CONFLICT');
    expect(w.mongo.st.registry.active.escrow_address).to.equal(OLD);
  });

  it('refuses when registry active is not the old escrow', async () => {
    const w = world({ registry: { active: active({ escrow_address: NEW }) } });
    const r = await exec(['--rotate', '--apply'], w);
    expect(r.code).to.equal(1);
    expect(w.mongo.st.writes).to.have.length(0);
  });
});

describe('rotate-escrow.js --restore', () => {
  it('reverses a verified rotation (collections, mirror, redis, registry)', async () => {
    const w = world();
    const originalOrders = clone(w.mongo.st.colls.orders.docs);
    expect((await exec(['--rotate', '--apply'], w)).code).to.equal(0);
    // new-escrow live data appears after rotation
    w.mongo.st.colls.orders = { docs: [{ _id: 1, onchain_order_id: '1', status: 'OPEN' }], indexes: [{ name: '_id_', key: { _id: 1 } }] };
    w.redis.st.kv.set('worker:dlq', 'newdlq');
    const dry = await exec(['--restore', AID], w);
    expect(dry.code, dry.out).to.equal(0);
    expect(dry.out).to.include('DRY-RUN');
    expect(w.mongo.st.registry.active.escrow_address).to.equal(NEW);

    const r = await exec(['--restore', AID, '--apply'], { ...w, env: { ...ENV, OLD_ESCROW_ADDRESS: undefined } });
    expect(r.code, r.out).to.equal(0);
    expect(r.out).to.include(`RESTORE_TARGET_ESCROW=${OLD}`);
    expect(r.out).to.include('RESTORE_TARGET_DEPLOY_BLOCK=10');
    expect(dry.out).to.not.include('RESTORE_TARGET_');
    expect(w.mongo.st.registry.active).to.include({ escrow_address: OLD, state: 'ACTIVE', deploy_block: 10 });
    expect(w.mongo.st.colls.orders.docs).to.deep.equal(originalOrders);
    expect(w.mongo.st.colls[archiveName(CHAIN, NEW, 'orders')].docs[0].status).to.equal('OPEN');
    expect(w.redis.st.kv.get('worker:dlq')).to.equal('x');
    expect(w.redis.st.kv.get(`worker:dlq:archived:${CHAIN}:${NEW}:live`)).to.equal('newdlq');
    expect(w.redis.st.kv.get('worker:last_block')).to.equal('150');
    expect(w.redis.st.kv.get('worker:last_safe_block')).to.equal('140');
    const u1 = w.mongo.st.users.find((u) => u._id === 'u1');
    expect(u1.is_banned).to.equal(true);
    expect(w.mongo.st.registry[AID].restore.state).to.equal('R_VERIFIED');
  });

  it('rejects a bad archive id and an unverified rotation', async () => {
    const w = world();
    expect((await exec(['--restore', 'nonsense', '--apply'], w)).code).to.equal(1);
    expect((await exec(['--restore', AID, '--apply'], w)).code).to.equal(1);
    expect(w.mongo.st.writes).to.have.length(0);
  });

  it('old_deploy_block null/invalid: restore stops without ANY write', async () => {
    for (const bad of [null, 0, 'x', 1.5]) {
      const w = world();
      expect((await exec(['--rotate', '--apply'], w)).code).to.equal(0);
      w.mongo.st.registry[AID].old_deploy_block = bad;
      const before = w.mongo.st.writes.length;
      const redisBefore = w.redis.st.writes.length;
      const r = await exec(['--restore', AID, '--apply'], { ...w, env: { ...ENV, OLD_ESCROW_ADDRESS: undefined } });
      expect(r.code).to.equal(1);
      expect(r.out).to.include('old_deploy_block');
      expect(r.out).to.not.include('RESTORE_TARGET_');
      expect(w.mongo.st.writes.length).to.equal(before);
      expect(w.redis.st.writes.length).to.equal(redisBefore);
      expect(w.mongo.st.registry.active.escrow_address).to.equal(NEW);
    }
  });

  it('accepts a mixed-case archive id and rejects malformed ones (chain part max 10 digits)', async () => {
    const w = world();
    expect((await exec(['--rotate', '--apply'], w)).code).to.equal(0);
    const mixed = `${CHAIN}:0x${'AB'.repeat(20)}`;
    const r = await exec(['--restore', mixed], { ...w, env: { ...ENV, OLD_ESCROW_ADDRESS: undefined } });
    expect(r.code, r.out).to.equal(0);
    for (const bad of [`84532-${OLD}`, `12345678901:${OLD}`, `${CHAIN}:0x12`, `x:${OLD}`]) {
      expect((await exec(['--restore', bad], { ...w, env: { ...ENV, OLD_ESCROW_ADDRESS: undefined } })).code).to.equal(1);
    }
  });
});
