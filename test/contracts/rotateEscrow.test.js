// [TR] .github/scripts/rotate-escrow.js: sahte Mongo/Redis/RPC (enjekte), ağ yok, sahte değerler.
// [EN] rotate-escrow.js with injected in-memory Mongo/Redis/chain fakes. No network, dummy values only.
const { expect } = require('chai');
const path = require('path');

const mod = require('../../.github/scripts/rotate-escrow.js');
const { run, archiveName, canonicalJson, pickMirror, isDefaultMirror, mirrorDefaults, moveCollection, COLLECTIONS, ARCHIVE_NAME_RE } = mod;

const URI = 'mongodb+srv://dbuser:Sup3rSecretPw@cluster0.example.mongodb.net/araf';
const REDIS = 'rediss://default:RedisSecretPw@redis.example.com:6380';
const RPC = 'https://rpc.example.com/v2/KEY_SECRET_123';
const OLD = `0x${'ab'.repeat(20)}`;
const NEW = `0x${'cd'.repeat(20)}`;
const CHAIN = 84532;
const AID = `${CHAIN}:${OLD}`;
const ENV = {
  MONGODB_URI: URI, REDIS_URL: REDIS, RPC_URL: RPC, OLD_ESCROW_ADDRESS: OLD.toUpperCase().replace('0X', '0x'),
  ARAF_ESCROW_ADDRESS: NEW, ARAF_DEPLOYMENT_BLOCK: '200', EXPECTED_CHAIN_ID: String(CHAIN),
  GITHUB_RUN_ID: '777', GITHUB_RUN_ATTEMPT: '1', GITHUB_ACTOR: 'octo', GITHUB_SHA: 'a'.repeat(40),
};

const clone = (v) => {
  if (v instanceof Date) return new Date(v);
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o; }
  return v;
};

function fakeMongo({ users = [], colls = {}, registry = {} } = {}) {
  const st = { writes: [], registry: {}, colls: {}, users: clone(users), mirrors: {}, failRename: null, corruptAfterRename: false, probeOk: true, privs: { known: true, actions: ['find', 'insert', 'update', 'createIndex', 'renameCollectionSameDB'] }, stats: { dataSize: 1, storageSize: 2, collections: 3, objects: 4 }, mirrorOpen: { trades: [], orders: [] } };
  for (const [k, v] of Object.entries(registry)) st.registry[k] = clone(v);
  for (const [k, v] of Object.entries(colls)) st.colls[k] = { docs: clone(v), indexes: [{ name: '_id_', key: { _id: 1 } }, { name: `${k}_ix`, key: { a: 1 }, unique: true }] };
  const w = (s) => st.writes.push(s);
  const m = {
    st,
    async getDoc(id) { return st.registry[id] ? clone(st.registry[id]) : null; },
    async insertDoc(d) { w(`insert ${d._id}`); st.registry[d._id] = clone(d); },
    async setDoc(id, set) { w(`set ${id}`); Object.assign(st.registry[id], clone(set)); },
    async replaceDoc(id, d) { w(`replace ${id}`); st.registry[id] = clone(d); },
    async collectionExists(n) { return !!st.colls[n]; },
    async countDocs(n) { return st.colls[n] ? st.colls[n].docs.length : 0; },
    async listIndexSpecs(n) { return clone(st.colls[n].indexes); },
    iterateDocs(n) { return (async function* g() { for (const d of st.colls[n].docs) yield clone(d); }()); },
    async renameCollection(a, b) {
      w(`rename ${a}`);
      if (st.failRename === a) throw new Error(`boom ${URI}`);
      if (st.colls[b]) throw new Error('target exists');
      st.colls[b] = st.colls[a]; delete st.colls[a];
      if (st.corruptAfterRename && st.colls[b].docs[0]) st.colls[b].docs[0].tampered = 1;
    },
    async stampAll(n, stamp) { w(`stamp ${n}`); st.colls[n].docs.forEach((d) => { if (!d._archive) d._archive = clone(stamp); }); },
    async unstampAll(n) { w(`unstamp ${n}`); st.colls[n].docs.forEach((d) => { delete d._archive; }); },
    async readUserMirrorPage(after, limit) {
      const i = after === null ? 0 : st.users.findIndex((u) => u._id === after) + 1;
      return st.users.slice(i, i + limit).map((u) => { const o = { _id: u._id, wallet_address: u.wallet_address }; for (const f of mod.MIRROR_FIELDS) if (u[f] !== undefined) o[f] = clone(u[f]); return o; });
    },
    async applyUserMirrorBatch({ archiveColl, docs, ids, defaults }) {
      w(`usersbatch ${archiveColl}`);
      st.mirrors[archiveColl] = st.mirrors[archiveColl] || new Map();
      for (const d of docs) if (!st.mirrors[archiveColl].has(d._id)) st.mirrors[archiveColl].set(d._id, clone(d));
      st.users.forEach((u) => { if (ids.includes(u._id)) Object.assign(u, clone(defaults)); });
      st.colls[archiveColl] = { docs: [...st.mirrors[archiveColl].values()], indexes: [] };
    },
    async readMirrorArchivePage(n, after, limit) {
      const docs = st.colls[n] ? st.colls[n].docs : [];
      const i = after === null ? 0 : docs.findIndex((d) => d._id === after) + 1;
      return clone(docs.slice(i, i + limit));
    },
    async restoreUserMirrorBatch(docs) {
      w('usersrestore');
      for (const d of docs) Object.assign(st.users.find((u) => u.wallet_address === d.wallet_address), clone(d.mirror));
    },
    async openFromMirror() { return st.mirrorOpen; },
    async privileges() { return st.privs; },
    async probeRename(n) { w(`probe ${n}`); return st.probeOk ? { ok: true } : { ok: false, reason: 'CommandNotSupported' }; },
    async dbStats() { return st.stats; },
    async close() {},
  };
  return m;
}

function fakeRedis(initial = {}) {
  const st = { kv: new Map(Object.entries(initial)), writes: [], failRenameAt: null, renames: 0 };
  return {
    st,
    async ping() {},
    async exists(k) { return st.kv.has(k); },
    async renameNx(a, b) {
      st.renames += 1;
      if (st.failRenameAt === st.renames) throw new Error(`redis down ${REDIS}`);
      st.writes.push(`rename ${a}`);
      if (st.kv.has(b)) return false;
      st.kv.set(b, st.kv.get(a)); st.kv.delete(a); return true;
    },
    async get(k) { return st.kv.has(k) ? st.kv.get(k) : null; },
    async set(k, v) { st.writes.push(`set ${k}`); st.kv.set(k, v); },
    async del(...ks) { st.writes.push(`del ${ks.join(',')}`); ks.forEach((k) => st.kv.delete(k)); },
    async close() {},
  };
}

function fakeChain({ paused = true, trades = [], orders = [], code = '0x6080', chainId = CHAIN } = {}) {
  return {
    async chainId() { return chainId; },
    async getCode() { return code; },
    async paused() { return paused; },
    async counters() { return { trades: trades.length, orders: orders.length }; },
    async tradeStates() { return trades; },
    async orderStates() { return orders; },
  };
}

const T0 = new Date('2026-05-01T00:00:00Z');
const active = (over = {}) => ({ _id: 'active', escrow_address: OLD, chain_id: CHAIN, deploy_block: 10, state: 'ACTIVE', since: T0, updated_by: 'x', ...over });
const wallet = (n) => `0x${String(n).padStart(40, '0')}`;
const mkUsers = () => [
  { _id: 'u1', wallet_address: wallet(1), payout_profile: { iban_enc: 'SECRET-IBAN-CIPHER' }, reputation_cache: { success_rate: 40, total_trades: 5, successful_trades: 2, failed_disputes: 3, effective_tier: 1, failure_score: 7 }, is_banned: true, consecutive_bans: 2, ...{ reputation_history: [{ tradeId: 3 }] } },
  { _id: 'u2', wallet_address: wallet(2), payout_profile: { iban_enc: 'OTHER' }, ...mirrorDefaults() },
];
const mkColls = () => {
  const c = {};
  for (const n of COLLECTIONS) c[n] = [];
  c.orders = [{ _id: 1, onchain_order_id: '1', status: 'FILLED' }, { _id: 2, onchain_order_id: '2', status: 'CANCELED', when: T0 }];
  c.trades = [{ _id: 1, onchain_escrow_id: '1', status: 'RESOLVED', pii: { enc: 'CIPHER' } }];
  c.rewardepoches = [{ _id: 1, epoch: 1, token: '0x1' }];
  return c;
};

async function exec(argv, { env = ENV, mongo, redis, chain } = {}) {
  const lines = [];
  const deps = { mongo, redis, chain: chain === undefined ? fakeChain() : chain };
  const code = await run({ argv, env, deps, out: (l) => lines.push(String(l)), now: () => T0 });
  return { code, out: lines.join('\n') };
}
const world = (over = {}) => ({
  mongo: fakeMongo({ users: mkUsers(), colls: mkColls(), registry: { active: active() }, ...over }),
  redis: fakeRedis({ 'worker:last_block': '150', 'worker:last_safe_block': '140', 'worker:dlq': 'x', 'worker:dlq:keys': 'y', 'cache:protocol_config:v3:last_known': 'cfg' }),
});

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
  it('without RPC_URL: counts from Mongo mirror, says so, and fails closed on pause', async () => {
    const w = world();
    w.mongo.st.mirrorOpen = { trades: ['9'], orders: ['3', '1'] };
    const env = { ...ENV, CONFIRM_ARCHIVE_ACTIVE_TRADES: 'YES' };
    delete env.RPC_URL;
    const r = await exec(['--precheck'], { ...w, chain: null, env });
    expect(r.out).to.include('open-record source: mongo-mirror');
    expect(r.out).to.include('ids=1,3');
    expect(r.code).to.equal(1);
    expect(r.out).to.include('pause state');
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
});
