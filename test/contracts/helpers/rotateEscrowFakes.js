// [TR] rotate-escrow.js testleri için ortak sahte Mongo/Redis/RPC (bellek içi) ve sabitler. Ağ yok, sahte değerler.
// [EN] Shared in-memory fakes + constants for the rotate-escrow tests.
const mod = require('../../../.github/scripts/rotate-escrow.js');
const { COLLECTIONS, mirrorDefaults } = mod;

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

const world = (over = {}) => ({
  mongo: fakeMongo({ users: mkUsers(), colls: mkColls(), registry: { active: active() }, ...over }),
  redis: fakeRedis({ 'worker:last_block': '150', 'worker:last_safe_block': '140', 'worker:dlq': 'x', 'worker:dlq:keys': 'y', 'cache:protocol_config:v3:last_known': 'cfg' }),
});

module.exports = { URI, REDIS, RPC, OLD, NEW, CHAIN, AID, ENV, clone, fakeMongo, fakeRedis, fakeChain, T0, active, wallet, mkUsers, mkColls, world };
