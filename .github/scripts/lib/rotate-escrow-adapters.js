// [TR] rotate-escrow.js için GERÇEK bağlayıcılar (Mongo / Redis / RPC). Çekirdek mantık enjekte edilen sahte
//      bağlayıcılarla test edilir; bu dosya yalnız sürücü kablolamasıdır. URI/secret hiçbir koşulda yazdırılmaz.
//      Sürücüler yeni bağımlılık değildir: backend/node_modules içinden yüklenir (escrow-registry.js deseni).
// [EN] REAL adapters (Mongo / Redis / RPC) for rotate-escrow.js. Core logic is tested with injected fakes.
'use strict';
const path = require('path');

const BACKEND = path.resolve(__dirname, '../../../backend');
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const REGISTRY = 'escrow_registry';
const OPEN_TRADE_STATUSES = ['LOCKED', 'PAID', 'CHALLENGED'];
const OPEN_ORDER_STATUSES = ['OPEN', 'PARTIALLY_FILLED'];

function loadFromBackend(name) {
  try {
    return require(require.resolve(name, { paths: [BACKEND] }));
  } catch {
    const err = new Error(`${name} driver not found; run "npm ci --omit=dev --prefix backend" first.`);
    err.safe = true;
    throw err;
  }
}

// ── Mongo ────────────────────────────────────────────────────────────────────
function createMongo(uri, { mirrorFields, appName = 'araf-rotate-escrow' }) {
  const driver = loadFromBackend('mongodb');
  const client = new driver.MongoClient(uri, { serverSelectionTimeoutMS: 15000, appName });
  let db = null;
  const open = async () => { if (!db) { await client.connect(); db = client.db(); } return db; };
  const coll = async (n) => (await open()).collection(n);
  const projection = { wallet_address: 1 };
  for (const f of mirrorFields) projection[f] = 1;

  return {
    async getDoc(id) { return (await coll(REGISTRY)).findOne({ _id: id }); },
    async insertDoc(doc) { await (await coll(REGISTRY)).insertOne(doc); },
    async setDoc(id, set) { await (await coll(REGISTRY)).updateOne({ _id: id }, { $set: set }); },
    async replaceDoc(id, doc) { await (await coll(REGISTRY)).replaceOne({ _id: id }, doc, { upsert: true }); },

    async collectionExists(name) {
      return (await (await open()).listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
    },
    async countDocs(name) { return (await coll(name)).countDocuments({}); },
    async listIndexSpecs(name) {
      const idx = await (await coll(name)).indexes();
      return idx.map((i) => ({
        name: i.name,
        key: i.key,
        unique: !!i.unique,
        sparse: !!i.sparse,
        expireAfterSeconds: i.expireAfterSeconds === undefined ? null : i.expireAfterSeconds,
        partialFilterExpression: i.partialFilterExpression || null,
      }));
    },
    iterateDocs(name) {
      return (async function* gen() {
        const cur = (await coll(name)).find({}, { sort: { _id: 1 } });
        try { for await (const d of cur) yield d; } finally { await cur.close().catch(() => {}); }
      }());
    },
    async renameCollection(from, to) { await (await open()).renameCollection(from, to, { dropTarget: false }); },
    async stampAll(name, stamp) {
      const r = await (await coll(name)).updateMany({ _archive: { $exists: false } }, { $set: { _archive: stamp } });
      return r.modifiedCount;
    },
    async unstampAll(name) {
      const r = await (await coll(name)).updateMany({ _archive: { $exists: true } }, { $unset: { _archive: '' } });
      return r.modifiedCount;
    },

    // [TR] Yalnız cüzdan + zincir aynası alanları okunur (payout_profile projeksiyona GİRMEZ).
    async readUserMirrorPage(after, limit) {
      const q = after === null ? {} : { _id: { $gt: after } };
      return (await coll('users')).find(q, { projection, sort: { _id: 1 }, limit }).toArray();
    },
    async applyUserMirrorBatch({ archiveColl, docs, ids, defaults }) {
      // [TR] Koleksiyon transaction'dan ÖNCE açıkça oluşturulur (transaction içinde implicit create sınırlı/riskli).
      if (!(await (await open()).listCollections({ name: archiveColl }, { nameOnly: true }).toArray()).length) {
        try { await (await open()).createCollection(archiveColl); } catch (e) { if (!e || e.code !== 48) throw e; }
      }
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const mirror = await coll(archiveColl);
          if (docs.length) {
            await mirror.bulkWrite(
              docs.map((d) => ({ updateOne: { filter: { _id: d._id }, update: { $setOnInsert: d }, upsert: true } })),
              { session },
            );
          }
          await (await coll('users')).updateMany({ _id: { $in: ids } }, { $set: defaults }, { session });
        });
      } finally { await session.endSession(); }
    },
    async readMirrorArchivePage(name, after, limit) {
      const q = after === null ? {} : { _id: { $gt: after } };
      return (await coll(name)).find(q, { sort: { _id: 1 }, limit }).toArray();
    },
    async restoreUserMirrorBatch(docs) {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const users = await coll('users');
          await users.bulkWrite(
            docs.map((d) => ({ updateOne: { filter: { wallet_address: d.wallet_address }, update: { $set: d.mirror } } })),
            { session },
          );
        });
      } finally { await session.endSession(); }
    },

    // [TR] Mongo aynası: açık trade/order id'leri (RPC yoksa yedek sayım yolu).
    async openFromMirror() {
      const t = await (await coll('trades')).find({ status: { $in: OPEN_TRADE_STATUSES } }, { projection: { onchain_escrow_id: 1 } }).toArray();
      const o = await (await coll('orders')).find({ status: { $in: OPEN_ORDER_STATUSES } }, { projection: { onchain_order_id: 1 } }).toArray();
      return { trades: t.map((x) => String(x.onchain_escrow_id)), orders: o.map((x) => String(x.onchain_order_id)) };
    },

    async privileges() {
      try {
        const r = await (await open()).admin().command({ connectionStatus: 1, showPrivileges: true });
        const privs = (r.authInfo && r.authInfo.authenticatedUserPrivileges) || [];
        const actions = new Set();
        for (const p of privs) for (const a of (p.actions || [])) actions.add(a);
        return { known: true, actions: [...actions] };
      } catch (e) {
        return { known: false, reason: (e && e.name) || 'Error' };
      }
    },
    async probeRename(name) {
      const d = await open();
      const a = name;
      const b = `${name}_b`;
      try {
        await d.collection(a).insertOne({ probe: true });
        await d.renameCollection(a, b, { dropTarget: false });
        await d.collection(b).drop();
        return { ok: true };
      } catch (e) {
        await d.collection(a).drop().catch(() => {});
        await d.collection(b).drop().catch(() => {});
        return { ok: false, reason: (e && e.name) || 'Error' };
      }
    },
    async dbStats() {
      const s = await (await open()).command({ dbStats: 1 });
      return { dataSize: s.dataSize, storageSize: s.storageSize, collections: s.collections, objects: s.objects };
    },
    async close() { await client.close().catch(() => {}); },
  };
}

// ── Redis ────────────────────────────────────────────────────────────────────
function createRedis(url, env = process.env) {
  const { createClient } = loadFromBackend('redis');
  let u;
  try { u = new URL(url); } catch { const e = new Error('REDIS_URL is not a valid URL'); e.safe = true; throw e; }
  const plainOk = env.ALLOW_PLAIN_REDIS_FOR_TEST === '1' && u.protocol === 'redis:';
  if (u.protocol !== 'rediss:' && !plainOk) { const e = new Error('REDIS_URL must be rediss://'); e.safe = true; throw e; }
  const client = createClient({ url, socket: { connectTimeout: 15000, reconnectStrategy: false } });
  client.on('error', () => {}); // [TR] hata metni URL içerebilir; bastırılır, çağrı reddi çağıran tarafta yakalanır.
  let up = false;
  const c = async () => { if (!up) { await client.connect(); up = true; } return client; };
  return {
    async ping() { await (await c()).ping(); },
    async exists(k) { return (await (await c()).exists(k)) === 1; },
    async renameNx(a, b) { return Boolean(await (await c()).renameNX(a, b)); },
    async get(k) { return (await c()).get(k); },
    async set(k, v) { await (await c()).set(k, v); },
    async del(...ks) { return (await c()).del(ks); },
    async close() { if (up) await client.quit().catch(() => {}); },
  };
}

// ── Chain (RPC + Multicall3) ─────────────────────────────────────────────────
const TRADE_TUPLE = 'tuple(uint64 id,uint64 parentOrderId,address maker,address taker,address tokenAddress,uint256 cryptoAmount,uint256 makerBond,uint256 takerBond,uint16 takerFeeBpsSnapshot,uint16 makerFeeBpsSnapshot,uint8 tier,uint8 paymentRiskLevelSnapshot,uint8 state,uint64 lockedAt,uint64 paidAt,uint64 challengedAt,bool cancelProposedByMaker,bool cancelProposedByTaker,uint64 pingedAt,bool pingedByTaker,uint64 challengePingedAt,bool challengePingedByMaker)';
const ORDER_TUPLE = 'tuple(uint64 id,address owner,uint8 side,address tokenAddress,uint256 totalAmount,uint256 remainingAmount,uint256 minFillAmount,uint256 remainingMakerBondReserve,uint256 remainingTakerBondReserve,uint16 takerFeeBpsSnapshot,uint16 makerFeeBpsSnapshot,uint8 tier,uint8 paymentRiskLevel,uint8 state,bytes32 orderRef)';
const ESCROW_ABI = [
  `function getTrade(uint256) view returns (${TRADE_TUPLE})`,
  `function getOrder(uint256) view returns (${ORDER_TUPLE})`,
  'function tradeCounter() view returns (uint256)',
  'function orderCounter() view returns (uint256)',
  'function paused() view returns (bool)',
];
const MULTICALL_ABI = ['function aggregate3(tuple(address target,bool allowFailure,bytes callData)[] calls) payable returns (tuple(bool success,bytes returnData)[] returnData)'];
const BATCH = 100;

function createChain(rpcUrl, { provider } = {}) {
  const ethers = loadFromBackend('ethers');
  const p = provider || new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
  const esc = new ethers.Interface(ESCROW_ABI);
  const mc = new ethers.Interface(MULTICALL_ABI);

  async function multicall(target, fn, ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const calls = slice.map((id) => ({ target, allowFailure: false, callData: esc.encodeFunctionData(fn, [id]) }));
      const raw = await p.call({ to: MULTICALL3, data: mc.encodeFunctionData('aggregate3', [calls]) });
      const [res] = mc.decodeFunctionResult('aggregate3', raw);
      res.forEach((r) => out.push(esc.decodeFunctionResult(fn, r.returnData)[0]));
    }
    return out;
  }
  const single = async (addr, fn) => esc.decodeFunctionResult(fn, await p.call({ to: addr, data: esc.encodeFunctionData(fn) }))[0];
  const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

  return {
    async chainId() { return Number((await p.getNetwork()).chainId); },
    async getCode(addr) { return p.getCode(addr); },
    async paused(addr) { return Boolean(await single(addr, 'paused')); },
    async counters(addr) {
      return { trades: Number(await single(addr, 'tradeCounter')), orders: Number(await single(addr, 'orderCounter')) };
    },
    // [TR] Yalnız durum numarası döner (TradeState: 1 LOCKED 2 PAID 3 CHALLENGED; OrderState: 0 OPEN 1 PARTIALLY_FILLED).
    async tradeStates(addr, count) {
      return (await multicall(addr, 'getTrade', range(count))).map((t) => Number(t.state));
    },
    async orderStates(addr, count) {
      return (await multicall(addr, 'getOrder', range(count))).map((o) => Number(o.state));
    },
    async close() { if (p.destroy) p.destroy(); },
  };
}

module.exports = { createMongo, createRedis, createChain, MULTICALL3, ESCROW_ABI, MULTICALL_ABI };
