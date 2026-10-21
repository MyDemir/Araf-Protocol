#!/usr/bin/env node
// [TR] Escrow rotasyonu: eski escrow'a bağlı Mongo/Redis kayıtlarını arşive taşır (docs/TR/arsiv/01 §1-§4, §6; 02 kararları).
//        node .github/scripts/rotate-escrow.js --precheck
//        node .github/scripts/rotate-escrow.js --rotate  [--apply]     (varsayılan dry-run)
//        node .github/scripts/rotate-escrow.js --restore <chainId>:<eskiEscrow> [--apply]
//      Makine durdurma/başlatma ve Fly env değişimi BU betikte YOK; makinelerin durduğu varsayılır.
//      Durum makinesi (manifest: escrow_registry `_id:"<chainId>:<eskiEscrowLower>"`):
//        PLANNED -> MONGO_DONE -> USERS_DONE -> REDIS_DONE -> ACTIVE_SWITCHED -> VERIFIED
//      Tekrar çalıştırma kaldığı yerden devam eder. Kaynak/hedef karar tablosu: var/yok -> yap; yok/var -> atla;
//      dolu/dolu -> DUR (el ile inceleme). Commit noktası: registry active = {yeni escrow, ACTIVE}.
//      Şifreli alanlar asla çözülmez; MASTER_ENCRYPTION_KEY / JWT_SECRET env'de varsa betik BAŞLAMAZ.
//      Log'a yalnız ad/sayı/hash/adres basılır (belge içeriği, cüzdan, URI asla).
// [EN] Escrow rotation: moves old-escrow Mongo/Redis records into archive names, with a resumable state machine,
//      count + canonical SHA-256 + index-set verification before the commit point. Default is dry-run.
'use strict';
const crypto = require('crypto');

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const POSITIVE_INT_RE = /^[1-9][0-9]{0,15}$/;
const NUM_RE = /^[0-9]{1,20}$/;
const ARCHIVE_NAME_RE = /^archive_[0-9]+_0x[0-9a-f]{40}_[a-z_]+$/;
const ARCHIVE_ID_RE = /^([0-9]{1,10}):(0x[0-9a-fA-F]{40})$/;
const FORBIDDEN_ENV = ['MASTER_ENCRYPTION_KEY', 'JWT_SECRET'];
const USER_BATCH = 500;
const ID_LIST_CAP = 200;

const STATES = ['PLANNED', 'MONGO_DONE', 'USERS_DONE', 'REDIS_DONE', 'ACTIVE_SWITCHED', 'VERIFIED'];
const RESTORE_STATES = ['R_PLANNED', 'R_MONGO_DONE', 'R_USERS_DONE', 'R_REDIS_DONE', 'R_ACTIVE_SWITCHED', 'R_VERIFIED'];

// [TR] Gerçek koleksiyon adları (mongoose çoğullaştırması doğrulandı: RewardEpoch -> "rewardepoches").
const COLLECTIONS = [
  'orders', 'trades', 'terminal_trade_stats', 'revenueevents',
  'rewardepoches', 'rewardclaims', 'rewardfundings', 'rewardepochallocationevents',
];
const USER_MIRROR_SUFFIX = 'user_chain_mirror';

// [TR] User'daki zincir aynası alanları (User.js ile aynı varsayılanlar; payout_profile ASLA burada yok).
const MIRROR_FIELDS = [
  'reputation_cache', 'reputation_history', 'reputation_breakdown', 'is_banned', 'banned_until',
  'last_ban_ends_at', 'consecutive_bans', 'max_allowed_tier', 'last_onchain_sync_at',
];
const mirrorDefaults = () => ({
  reputation_cache: { success_rate: 100, total_trades: 0, successful_trades: 0, failed_disputes: 0, effective_tier: 0, failure_score: 0 },
  reputation_history: [],
  reputation_breakdown: {
    manual_release_count: 0, burn_count: 0, auto_release_count: 0, mutual_cancel_count: 0,
    disputed_resolved_count: 0, dispute_win_count: 0, dispute_loss_count: 0, partial_settlement_count: 0,
    risk_points: 0, last_positive_event_at: null, last_negative_event_at: null,
  },
  is_banned: false,
  banned_until: null,
  last_ban_ends_at: null,
  consecutive_bans: 0,
  max_allowed_tier: 4,
  last_onchain_sync_at: null,
});

// Redis: eski escrow'a ait anahtar -> arşiv son eki
const REDIS_DLQ_KEYS = {
  'worker:dlq': 'live',
  'worker:dlq:keys': 'live:keys',
  'worker:dlq:archive': 'archive',
  'worker:dlq:archive:keys': 'archive:keys',
  'worker:dlq:quarantine': 'quarantine',
  'worker:dlq:quarantine:keys': 'quarantine:keys',
};
const LAST_KNOWN_KEY = 'cache:protocol_config:v3:last_known';
const CONFIG_CACHE_KEY = 'cache:protocol_config:v3';
const CHECKPOINT_KEYS =['worker:last_block', 'worker:last_safe_block'];

const OPEN_TRADE_STATES = new Set([1, 2, 3]); // LOCKED, PAID, CHALLENGED
const OPEN_ORDER_STATES = new Set([0, 1]); // OPEN, PARTIALLY_FILLED

// ── Yardımcılar (saf) ────────────────────────────────────────────────────────
class RotateError extends Error {
  constructor(msg) { super(msg); this.name = 'RotateError'; this.safe = true; }
}
const fail = (msg) => { throw new RotateError(msg); };

const archiveId = (chainId, escrow) => `${chainId}:${String(escrow).toLowerCase()}`;
function archiveName(chainId, escrow, collection) {
  const n = `archive_${chainId}_${String(escrow).toLowerCase()}_${collection}`;
  if (!ARCHIVE_NAME_RE.test(n)) fail('invalid archive collection name');
  return n;
}
const redisArchiveKey = (chainId, escrow, suffix) => `worker:dlq:archived:${chainId}:${String(escrow).toLowerCase()}:${suffix}`;
const lastKnownArchiveKey = (chainId, escrow) => `${LAST_KNOWN_KEY}:archived:${chainId}:${String(escrow).toLowerCase()}`;

const configCacheArchiveKey = (chainId, escrow) => `${CONFIG_CACHE_KEY}:archived:${chainId}:${String(escrow).toLowerCase()}`;

function redisMoves(chainId, escrow) {
  const moves = Object.entries(REDIS_DLQ_KEYS).map(([live, suffix]) => ({ live, archive: redisArchiveKey(chainId, escrow, suffix) }));
  moves.push({ live: LAST_KNOWN_KEY, archive: lastKnownArchiveKey(chainId, escrow) });
  // [TR] B4-01: TTL'li canlı protokol config önbelleği de taşınır; yeni escrow eski kontratın değerlerini sunmasın.
  moves.push({ live: CONFIG_CACHE_KEY, archive: configCacheArchiveKey(chainId, escrow) });
  return moves;
}

// [TR] Kanonik biçim: anahtarlar sıralı, BSON tipleri etiketli, `_archive` (kök) hariç.
function norm(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { $date: v.toISOString() };
  if (Array.isArray(v)) return v.map(norm);
  if (Buffer.isBuffer(v)) return { $binary: v.toString('base64') };
  if (typeof v === 'object') {
    const t = v._bsontype;
    if (t === 'ObjectId' || t === 'ObjectID') return { $oid: v.toHexString() };
    if (t === 'Decimal128') return { $numberDecimal: v.toString() };
    if (t === 'Long') return { $numberLong: v.toString() };
    if (t === 'Binary') return { $binary: Buffer.from(v.buffer).toString('base64') };
    if (t && typeof v.toExtendedJSON === 'function') return norm(v.toExtendedJSON());
    if (t) return { [`$${t}`]: String(v) };
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = norm(v[k]);
    return o;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) return { $number: String(v) };
  return v;
}
function canonicalJson(doc, { exclude = ['_archive'] } = {}) {
  const o = {};
  for (const k of Object.keys(doc).sort()) if (!exclude.includes(k)) o[k] = norm(doc[k]);
  return JSON.stringify(o);
}
async function hashCollection(mongo, name) {
  const h = crypto.createHash('sha256');
  let count = 0;
  for await (const d of mongo.iterateDocs(name)) {
    h.update(canonicalJson(d));
    h.update('\n');
    count += 1;
  }
  return { count, sha256: h.digest('hex') };
}
const indexSetKey = (specs) => JSON.stringify((specs || []).map((s) => norm(s)).map((s) => JSON.stringify(s)).sort());

// [TR] Zincir aynası alt kümesi: YALNIZ beyaz listedeki alanlar (payout_profile vb. asla girmez).
function pickMirror(user) {
  const out = {};
  for (const f of MIRROR_FIELDS) if (user[f] !== undefined) out[f] = user[f];
  return out;
}
function isDefaultMirror(user) {
  const d = mirrorDefaults();
  const merged = {};
  for (const f of MIRROR_FIELDS) merged[f] = user[f] === undefined ? d[f] : user[f];
  return JSON.stringify(norm(merged)) === JSON.stringify(norm(d));
}

function parseArgs(argv) {
  const out = { precheck: false, rotate: false, restore: null, apply: false, unknown: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--precheck') out.precheck = true;
    else if (a === '--rotate') out.rotate = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--restore') { out.restore = argv[i + 1] || ''; i += 1; } else out.unknown.push(a);
  }
  const modes = [out.precheck, out.rotate, out.restore !== null].filter(Boolean).length;
  if (modes !== 1 || (out.precheck && out.apply)) out.unknown.push('mode');
  return out;
}

function readConfig(env, args) {
  for (const k of FORBIDDEN_ENV) {
    if (String(env[k] || '').trim() !== '') fail(`${k} must NOT be present in this step's environment.`);
  }
  const cfg = {};
  const chain = String(env.EXPECTED_CHAIN_ID || '').trim();
  if (!POSITIVE_INT_RE.test(chain)) fail('EXPECTED_CHAIN_ID must be a positive integer.');
  cfg.chainId = Number(chain);
  if (!String(env.MONGODB_URI || '').trim()) fail('MONGODB_URI is required.');

  const addr = (name, raw) => {
    const v = String(raw || '').trim();
    if (!ADDRESS_RE.test(v) || v.toLowerCase() === ZERO_ADDRESS) fail(`${name} must be a non-zero 0x + 40 hex address.`);
    return v.toLowerCase();
  };
  if (args.restore !== null) {
    const m = ARCHIVE_ID_RE.exec(String(args.restore));
    if (!m) fail('--restore expects <chainId>:<oldEscrowLowercase>.');
    if (Number(m[1]) !== cfg.chainId) fail('restore archive id chain does not match EXPECTED_CHAIN_ID.');
    cfg.old = m[2].toLowerCase();
    cfg.archiveId = archiveId(cfg.chainId, cfg.old);
    if (String(env.ARAF_ESCROW_ADDRESS || '').trim()) cfg.new = addr('ARAF_ESCROW_ADDRESS', env.ARAF_ESCROW_ADDRESS);
    if (!String(env.REDIS_URL || '').trim()) fail('REDIS_URL is required.');
  } else {
    cfg.old = addr('OLD_ESCROW_ADDRESS', env.OLD_ESCROW_ADDRESS);
    // [TR] --precheck'te yeni escrow henüz deploy edilmemiş olabilir: ARAF_ESCROW_ADDRESS / ARAF_DEPLOYMENT_BLOCK opsiyonel.
    const newRaw = String(env.ARAF_ESCROW_ADDRESS || '').trim();
    const block = String(env.ARAF_DEPLOYMENT_BLOCK || '').trim();
    if (args.precheck && !newRaw) {
      cfg.new = null;
    } else {
      cfg.new = addr('ARAF_ESCROW_ADDRESS', newRaw);
      if (cfg.new === cfg.old) fail('ARAF_ESCROW_ADDRESS must differ from OLD_ESCROW_ADDRESS.');
    }
    if (block || !args.precheck) {
      if (!POSITIVE_INT_RE.test(block)) fail('ARAF_DEPLOYMENT_BLOCK must be a positive integer.');
      cfg.newBlock = Number(block);
    }
    if (args.precheck && !String(env.RPC_URL || '').trim()) fail('RPC_URL is required.');
    cfg.archiveId = archiveId(cfg.chainId, cfg.old);
    if (args.rotate && !String(env.REDIS_URL || '').trim()) fail('REDIS_URL is required.');
  }
  const runId = String(env.GITHUB_RUN_ID || '').trim();
  const attempt = String(env.GITHUB_RUN_ATTEMPT || '').trim();
  if (runId && !NUM_RE.test(runId)) fail('GITHUB_RUN_ID must be numeric.');
  if (attempt && !NUM_RE.test(attempt)) fail('GITHUB_RUN_ATTEMPT must be numeric.');
  cfg.runId = runId || 'manual';
  cfg.runAttempt = attempt || null;
  cfg.actor = String(env.GITHUB_ACTOR || '').replace(/[^A-Za-z0-9_.\[\]-]/g, '').slice(0, 64) || 'unknown';
  const sha = String(env.GITHUB_SHA || '').trim();
  cfg.gitSha = /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null;
  cfg.confirmActive = String(env.CONFIRM_ARCHIVE_ACTIVE_TRADES || '').trim() === 'YES';
  cfg.hasRpc = Boolean(String(env.RPC_URL || '').trim());
  return cfg;
}

// ── Açık trade / order sayımı ────────────────────────────────────────────────
const byNum = (a, b) => Number(a) - Number(b);
async function countOpen(ctx, escrow) {
  const { chain, mongo } = ctx;
  if (chain) {
    const { trades, orders } = await chain.counters(escrow);
    const ts = trades > 0 ? await chain.tradeStates(escrow, trades) : [];
    const os = orders > 0 ? await chain.orderStates(escrow, orders) : [];
    const t = []; const o = [];
    ts.forEach((s, i) => { if (OPEN_TRADE_STATES.has(s)) t.push(String(i + 1)); });
    os.forEach((s, i) => { if (OPEN_ORDER_STATES.has(s)) o.push(String(i + 1)); });
    return { source: 'chain-multicall', trades: t, orders: o };
  }
  const m = await mongo.openFromMirror();
  return { source: 'mongo-mirror', trades: [...m.trades].sort(byNum), orders: [...m.orders].sort(byNum) };
}
const fmtIds = (ids) => (ids.length <= ID_LIST_CAP ? ids.join(',') : `${ids.slice(0, ID_LIST_CAP).join(',')},...(+${ids.length - ID_LIST_CAP})`);
function reportOpen(ctx, open) {
  const { out } = ctx;
  out(`open-record source: ${open.source}${open.source === 'mongo-mirror' ? ' (RPC_URL not set; counted from the Mongo mirror, NOT authoritative)' : ''}`);
  out(`open trades (LOCKED/PAID/CHALLENGED): ${open.trades.length}${open.trades.length ? ` ids=${fmtIds(open.trades)}` : ''}`);
  out(`open orders (OPEN/PARTIALLY_FILLED): ${open.orders.length}${open.orders.length ? ` ids=${fmtIds(open.orders)}` : ''}`);
}
function openSummary(open) {
  return {
    source: open.source,
    trade_count: open.trades.length,
    order_count: open.orders.length,
    trade_ids: open.trades.slice(0, 500),
    order_ids: open.orders.slice(0, 500),
  };
}

// ── PRECHECK ─────────────────────────────────────────────────────────────────
async function precheck(ctx) {
  const { cfg, mongo, chain, redis, out } = ctx;
  const errors = [];
  const bad = (m) => { errors.push(m); out(`::error::${m}`); };

  const reg = await mongo.getDoc('active');
  if (!reg) bad('registry active document (_id "active") is missing.');
  else {
    if (String(reg.escrow_address || '').toLowerCase() !== cfg.old) bad('registry active.escrow_address does not equal OLD_ESCROW_ADDRESS.');
    if (Number(reg.chain_id) !== cfg.chainId) bad('registry active.chain_id does not equal EXPECTED_CHAIN_ID.');
    out(`registry active: state=${reg.state} chain=${reg.chain_id}`);
  }
  const manifest = await mongo.getDoc(cfg.archiveId);
  if (!cfg.new) {
    out('new escrow not yet known; skipped (new!=old and manifest comparison).');
  } else if (manifest) {
    if (String(manifest.new_escrow || '').toLowerCase() !== cfg.new) bad(`a manifest ${cfg.archiveId} already exists for a DIFFERENT new escrow.`);
    else out(`manifest ${cfg.archiveId} exists (state=${manifest.state}); the run will resume.`);
  }

  // Zincir: chain id + eski kontratta kod + pause
  if (chain) {
    const cid = await chain.chainId();
    if (cid !== cfg.chainId) bad('RPC chain id does not equal EXPECTED_CHAIN_ID.');
    const code = await chain.getCode(cfg.old);
    if (!code || code === '0x') bad('old escrow has no contract code on this chain.');
    const paused = await chain.paused(cfg.old);
    if (!paused) bad('old escrow is NOT paused; this workflow does not pause (owner key is not available). Pause it first.');
    else out('old escrow paused: yes');
  } else {
    bad('RPC_URL is not set: the pause state of the old escrow cannot be verified (fail-closed).');
  }

  // Açık kayıtlar
  const open = await countOpen(ctx, cfg.old);
  reportOpen(ctx, open);
  if (open.trades.length + open.orders.length > 0) {
    if (!cfg.confirmActive) bad('open trades/orders remain on the old escrow; set CONFIRM_ARCHIVE_ACTIVE_TRADES=YES to proceed.');
    else out('CONFIRM_ARCHIVE_ACTIVE_TRADES=YES: proceeding despite open records.');
  }

  // Mongo yetkisi + rename denemesi + dbStats
  const priv = await mongo.privileges();
  if (priv.known) {
    const need = ['find', 'insert', 'update', 'createIndex'];
    const missing = need.filter((a) => !priv.actions.includes(a));
    if (!priv.actions.includes('renameCollectionSameDB')) out('::warning::renameCollectionSameDB not listed among privileges; relying on the rename probe.');
    if (missing.length) bad(`missing Mongo privileges: ${missing.join(',')}`);
  } else {
    out(`::warning::Mongo privileges could not be listed (${priv.reason}); relying on the rename probe.`);
  }
  const probe = await mongo.probeRename(`archive_probe_${cfg.runId}`);
  if (probe.ok) out('rename probe: ok (renameCollection supported)');
  else {
    out(`::warning::rename probe FAILED (${probe.reason}): renameCollection is not supported with this user/cluster; copy mode would be required (copy mode is NOT implemented in this script).`);
    bad('renameCollection is not usable; this script cannot rotate.');
  }
  const st = await mongo.dbStats();
  const fields = ['dataSize', 'storageSize', 'collections', 'objects'];
  const badFields = fields.filter((f) => !Number.isFinite(st && st[f]));
  if (badFields.length) bad(`dbStats is missing numeric fields: ${badFields.join(',')}`);
  else out(`dbStats: dataSize=${st.dataSize} storageSize=${st.storageSize} collections=${st.collections} objects=${st.objects}`);

  if (redis) {
    try { await redis.ping(); out('redis: reachable'); } catch (e) { bad(`redis not reachable (${(e && e.name) || 'Error'}).`); }
  }

  out(errors.length ? `precheck FAILED (${errors.length} problem(s)).` : 'precheck OK.');
  return errors.length ? 1 : 0;
}

// ── Koleksiyon taşıma (karar tablosu) ────────────────────────────────────────
// recs: manifest içindeki kayıt nesnesi (ctx.save ile kalıcılaştırılır). expected: restore'da manifestteki değerler.
async function moveCollection(ctx, recs, name, from, to, { stamp = null, unstamp = false, expected = null, persist, targetWillBeFree = false }) {
  const { mongo, out, apply } = ctx;
  const rec = recs[name] || (recs[name] = {});
  if (rec.status === 'DONE' || rec.status === 'ABSENT') { out(`  ${name}: ${rec.status.toLowerCase()} (skip)`); return rec; }

  const srcExists = await mongo.collectionExists(from);
  // [TR] Dry-run'da restore (B) hedefi, (A) adımının boşaltacağı canlı addır.
  const dstExists = (!apply && targetWillBeFree) ? false : await mongo.collectionExists(to);
  const srcCount = srcExists ? await mongo.countDocs(from) : 0;
  const dstCount = dstExists ? await mongo.countDocs(to) : 0;

  if (srcExists && dstExists) {
    if (srcCount === 0 && rec.pre && dstCount > 0) {
      out(`  ${name}: target already holds the moved data and source is an empty leftover -> treat as moved`);
    } else {
      fail(`CONFLICT on ${name}: source (${srcCount} docs) and target ${to} (${dstCount} docs) both exist. Manual inspection required.`);
    }
  } else if (!srcExists && !dstExists) {
    out(`  ${name}: absent on both sides (nothing to move)`);
    if (apply) { rec.status = 'ABSENT'; await persist(); }
    return rec;
  } else if (!srcExists && dstExists && !rec.pre && !expected) {
    fail(`CONFLICT on ${name}: target ${to} exists but no manifest record proves this run moved it.`);
  }

  // ÖN değerler: manifestte yoksa kaynaktan hesapla
  if (srcExists && !dstExists) {
    if (!rec.pre) {
      const h = await hashCollection(mongo, from);
      const idx = await mongo.listIndexSpecs(from);
      rec.pre = { count: h.count, sha256: h.sha256, index_specs: idx };
      if (expected) {
        const same = h.count === expected.count && h.sha256 === expected.sha256 && indexSetKey(idx) === indexSetKey(expected.index_specs);
        if (!same) fail(`archive ${from} does not match the manifest (count/hash/index set); refusing to restore.`);
      }
    }
    out(`  ${name}: ${rec.pre.count} docs sha256=${rec.pre.sha256} -> ${to}`);
    if (!apply) return rec;
    rec.status = 'PRE';
    await persist();
    await mongo.renameCollection(from, to);
  } else if (!apply) {
    out(`  ${name}: already moved; would (re)verify ${to}`);
    return rec;
  }

  if (stamp) await mongo.stampAll(to, stamp);
  if (unstamp) await mongo.unstampAll(to);

  // SON doğrulama
  const want = rec.pre || expected;
  const post = await hashCollection(mongo, to);
  const postIdx = await mongo.listIndexSpecs(to);
  if (post.count !== want.count) fail(`VERIFY FAILED on ${name}: count ${want.count} -> ${post.count}.`);
  if (post.sha256 !== want.sha256) fail(`VERIFY FAILED on ${name}: sha256 mismatch.`);
  if (indexSetKey(postIdx) !== indexSetKey(want.index_specs)) fail(`VERIFY FAILED on ${name}: index set differs.`);
  if (await mongo.collectionExists(from) && (await mongo.countDocs(from)) > 0) fail(`VERIFY FAILED on ${name}: live name still holds documents.`);
  if (!rec.pre) rec.pre = { count: want.count, sha256: want.sha256, index_specs: want.index_specs };
  rec.post = { count: post.count, sha256: post.sha256 };
  rec.status = 'DONE';
  await persist();
  out(`  ${name}: verified (${post.count} docs, sha256 ${post.sha256}, ${postIdx.length} indexes)`);
  return rec;
}

// ── Kullanıcı zincir aynası ──────────────────────────────────────────────────
function toMirrorDoc(aid, user, archivedAt) {
  const wallet = String(user.wallet_address || '').toLowerCase();
  return { _id: `${aid}:${wallet}`, archive_id: aid, wallet_address: wallet, mirror: pickMirror(user), archived_at: archivedAt };
}
async function archiveUserMirror(ctx, { aid, archiveColl, archivedAt }) {
  const { mongo, apply } = ctx;
  const defaults = mirrorDefaults();
  let after = null; let archived = 0; let scanned = 0;
  for (;;) {
    const page = await mongo.readUserMirrorPage(after, USER_BATCH);
    if (!page.length) break;
    after = page[page.length - 1]._id;
    scanned += page.length;
    const hit = page.filter((u) => !isDefaultMirror(u) && u.wallet_address);
    if (hit.length) {
      archived += hit.length;
      if (apply) {
        await mongo.applyUserMirrorBatch({
          archiveColl,
          docs: hit.map((u) => toMirrorDoc(aid, u, archivedAt)),
          ids: hit.map((u) => u._id),
          defaults,
        });
      }
    }
  }
  return { scanned, archived };
}
async function countNonDefaultUsers(ctx) {
  const { mongo } = ctx;
  let after = null; let n = 0;
  for (;;) {
    const page = await mongo.readUserMirrorPage(after, USER_BATCH);
    if (!page.length) break;
    after = page[page.length - 1]._id;
    n += page.filter((u) => !isDefaultMirror(u)).length;
  }
  return n;
}
async function restoreUserMirror(ctx, archiveColl) {
  const { mongo, apply } = ctx;
  let after = null; let restored = 0;
  for (;;) {
    const page = await mongo.readMirrorArchivePage(archiveColl, after, USER_BATCH);
    if (!page.length) break;
    after = page[page.length - 1]._id;
    restored += page.length;
    if (apply) await mongo.restoreUserMirrorBatch(page.map((d) => ({ wallet_address: d.wallet_address, mirror: d.mirror })));
  }
  return restored;
}

// ── Redis taşıma ─────────────────────────────────────────────────────────────
async function moveRedisKeys(ctx, outcomes, pairs, persist) {
  const { redis, out, apply } = ctx;
  for (const { from, to } of pairs) {
    if (outcomes[from]) { out(`  redis ${from}: ${outcomes[from]} (skip)`); continue; }
    const s = await redis.exists(from);
    const d = await redis.exists(to);
    if (s && d) fail(`CONFLICT on redis key ${from}: source and target ${to} both exist. Manual inspection required.`);
    if (!s && d) { out(`  redis ${from}: already moved`); if (apply) { outcomes[from] = 'ALREADY'; await persist(); } continue; }
    if (!s && !d) { out(`  redis ${from}: absent`); if (apply) { outcomes[from] = 'ABSENT'; await persist(); } continue; }
    out(`  redis ${from} -> ${to}`);
    if (!apply) continue;
    if (!(await redis.renameNx(from, to))) fail(`CONFLICT on redis key ${from}: rename refused.`);
    outcomes[from] = 'RENAMED';
    await persist();
  }
}

// ── ROTATE ───────────────────────────────────────────────────────────────────
const idx = (s) => STATES.indexOf(s);

async function rotate(ctx) {
  const { cfg, mongo, redis, chain, out, apply, now } = ctx;
  out(`mode: ${apply ? 'APPLY' : 'DRY-RUN'} rotate ${cfg.archiveId} -> ${cfg.new}`);

  const reg = await mongo.getDoc('active');
  if (!reg) fail('registry active document is missing.');
  if (Number(reg.chain_id) !== cfg.chainId) fail('registry active.chain_id does not equal EXPECTED_CHAIN_ID.');
  const regAddr = String(reg.escrow_address || '').toLowerCase();

  let m = await mongo.getDoc(cfg.archiveId);
  if (m) {
    if (String(m.new_escrow || '').toLowerCase() !== cfg.new || Number(m.chain_id) !== cfg.chainId) fail('manifest exists for a different new escrow/chain; refusing.');
    if (m.restore && m.restore.state === 'R_VERIFIED') fail('this archive was already restored; a fresh rotation needs manual handling of the manifest.');
    if (!STATES.includes(m.state)) fail('manifest has an unknown state.');
    const needNew = idx(m.state) >= idx('ACTIVE_SWITCHED');
    if (needNew && regAddr !== cfg.new) fail('manifest says the switch happened but registry active is not the new escrow.');
    if (!needNew && regAddr !== cfg.old && !(m.state === 'REDIS_DONE' && regAddr === cfg.new)) fail('registry active does not equal OLD_ESCROW_ADDRESS.');
    out(`resuming manifest ${cfg.archiveId} at state ${m.state}`);
  } else {
    if (regAddr !== cfg.old) fail('registry active.escrow_address does not equal OLD_ESCROW_ADDRESS.');
    if (reg.state !== 'ACTIVE' && reg.state !== 'ROTATING') fail('registry active has an unexpected state.');
    // [TR] Geri yükleme hedefi bu değerden türetilir: geçersizse HİÇBİR yazma yapmadan dur.
    if (!Number.isInteger(reg.deploy_block) || reg.deploy_block < 1) fail('registry active.deploy_block is missing or invalid; refusing to rotate (nothing was written).');
    if (chain) {
      if (!(await chain.paused(cfg.old))) fail('old escrow is NOT paused; refusing to rotate.');
    } else out('::warning::RPC_URL not set; pause state not re-verified (precheck is responsible).');
    const open = await countOpen(ctx, cfg.old);
    reportOpen(ctx, open);
    if (open.trades.length + open.orders.length > 0 && !cfg.confirmActive) {
      fail('open trades/orders remain; set CONFIRM_ARCHIVE_ACTIVE_TRADES=YES to proceed.');
    }
    m = {
      _id: cfg.archiveId,
      old_escrow: cfg.old,
      new_escrow: cfg.new,
      chain_id: cfg.chainId,
      old_deploy_block: reg.deploy_block,
      new_deploy_block: cfg.newBlock,
      state: 'PLANNED',
      planned_at: now(),
      steps: { PLANNED: now() },
      github_run_id: cfg.runId,
      run_attempt: cfg.runAttempt,
      actor: cfg.actor,
      git_sha: cfg.gitSha,
      open_records: openSummary(open),
      collections: {},
    };
    out('step PLANNED: set registry active.state=ROTATING; write manifest');
    if (apply) {
      if (reg.state !== 'ROTATING') await mongo.setDoc('active', { state: 'ROTATING', updated_by: `github-run-${cfg.runId}` });
      await mongo.insertDoc(m);
    }
  }

  const save = async (part) => { Object.assign(m, part); if (apply) await mongo.setDoc(cfg.archiveId, part); };
  const advance = async (state) => {
    m.state = state; m.steps = { ...m.steps, [state]: now() };
    if (apply) await mongo.setDoc(cfg.archiveId, { state, steps: m.steps });
    out(`state -> ${state}`);
  };
  const persistCollections = () => save({ collections: m.collections });
  const stamp = { id: cfg.archiveId, escrow_address: cfg.old, chain_id: cfg.chainId, archived_at: new Date(m.planned_at) };

  // keep registry ROTATING while the run is in flight
  if (apply && idx(m.state) < idx('ACTIVE_SWITCHED') && regAddr === cfg.old && reg.state !== 'ROTATING') {
    await mongo.setDoc('active', { state: 'ROTATING', updated_by: `github-run-${cfg.runId}` });
  }

  // 1) MONGO
  if (idx(m.state) < idx('MONGO_DONE')) {
    out('step MONGO: renameCollection live -> archive');
    for (const c of COLLECTIONS) {
      await moveCollection(ctx, m.collections, c, c, archiveName(cfg.chainId, cfg.old, c), { stamp, persist: persistCollections });
    }
    await advance('MONGO_DONE');
    if (!apply) { printDryRunTail(ctx, 'USERS'); return 0; }
  }
  // 2) USERS
  if (idx(m.state) < idx('USERS_DONE')) {
    const archiveColl = archiveName(cfg.chainId, cfg.old, USER_MIRROR_SUFFIX);
    out(`step USERS: archive chain-mirror fields in batches of ${USER_BATCH} -> ${archiveColl}`);
    const r = await archiveUserMirror(ctx, { aid: cfg.archiveId, archiveColl, archivedAt: new Date(m.planned_at) });
    out(`  users scanned=${r.scanned} with-non-default-mirror=${r.archived}`);
    if (apply) {
      const left = await countNonDefaultUsers(ctx);
      if (left !== 0) fail(`VERIFY FAILED: ${left} users still hold non-default mirror fields.`);
      await save({ user_mirror: { collection: archiveColl, scanned: r.scanned, archived: r.archived } });
    }
    await advance('USERS_DONE');
    if (!apply) { printDryRunTail(ctx, 'REDIS'); return 0; }
  }
  // 3) REDIS
  if (idx(m.state) < idx('REDIS_DONE')) {
    out('step REDIS: rename DLQ + last_known keys, record then DEL checkpoints');
    if (!m.redis) m.redis = { checkpoints: null, keys: {} };
    if (!m.redis.checkpoints) {
      const cp = {};
      for (const k of CHECKPOINT_KEYS) cp[k] = await redis.get(k);
      m.redis.checkpoints = cp;
      out(`  checkpoints recorded: ${CHECKPOINT_KEYS.map((k) => `${k}=${cp[k] === null ? '(none)' : cp[k]}`).join(' ')}`);
      if (apply) await save({ redis: m.redis });
    }
    const pairs = redisMoves(cfg.chainId, cfg.old).map((x) => ({ from: x.live, to: x.archive }));
    await moveRedisKeys(ctx, m.redis.keys, pairs, () => save({ redis: m.redis }));
    out(`  DEL ${CHECKPOINT_KEYS.join(' ')} (checkpoint is never moved forward)`);
    if (apply) await redis.del(...CHECKPOINT_KEYS);
    await advance('REDIS_DONE');
    if (!apply) { printDryRunTail(ctx, 'ACTIVE'); return 0; }
  }
  // 4) COMMIT POINT
  if (idx(m.state) < idx('ACTIVE_SWITCHED')) {
    out('step ACTIVE: commit point (registry active = new escrow, ACTIVE)');
    for (const c of COLLECTIONS) {
      const r = m.collections[c];
      if (!r || (r.status !== 'DONE' && r.status !== 'ABSENT')) fail(`refusing commit: ${c} is not verified.`);
      if (await mongo.collectionExists(c) && (await mongo.countDocs(c)) > 0) fail(`refusing commit: live collection ${c} holds documents.`);
    }
    if (apply) {
      const cur = await mongo.getDoc('active');
      const curAddr = String((cur && cur.escrow_address) || '').toLowerCase();
      if (curAddr !== cfg.new || cur.state !== 'ACTIVE') {
        await mongo.replaceDoc('active', {
          _id: 'active',
          escrow_address: cfg.new,
          chain_id: cfg.chainId,
          deploy_block: cfg.newBlock,
          state: 'ACTIVE',
          since: now(),
          updated_by: `github-run-${cfg.runId}`,
        });
      }
    }
    await advance('ACTIVE_SWITCHED');
  }
  // 5) VERIFY
  if (idx(m.state) < idx('VERIFIED')) {
    out('step VERIFY: final read-back');
    if (apply) {
      const cur = await mongo.getDoc('active');
      if (!cur || String(cur.escrow_address).toLowerCase() !== cfg.new || cur.state !== 'ACTIVE' || Number(cur.deploy_block) !== cfg.newBlock) fail('VERIFY FAILED: registry active is not the new escrow/ACTIVE.');
      for (const c of COLLECTIONS) {
        const r = m.collections[c];
        if (r.status === 'ABSENT') continue;
        if (await mongo.collectionExists(c) && (await mongo.countDocs(c)) > 0) fail(`VERIFY FAILED: live ${c} holds documents.`);
        if ((await mongo.countDocs(archiveName(cfg.chainId, cfg.old, c))) !== r.pre.count) fail(`VERIFY FAILED: archive count of ${c} changed.`);
      }
      for (const k of CHECKPOINT_KEYS) if (await redis.exists(k)) fail('VERIFY FAILED: a worker checkpoint key still exists.');
    }
    await advance('VERIFIED');
  }
  out(apply ? 'rotation VERIFIED.' : 'dry-run: nothing written. Re-run with --apply.');
  return 0;
}

function printDryRunTail(ctx, from) {
  const order = ['USERS', 'REDIS', 'ACTIVE', 'VERIFY'];
  const text = {
    USERS: `step USERS: archive chain-mirror fields in batches of ${USER_BATCH} (transaction, $setOnInsert), reset live fields to schema defaults`,
    REDIS: 'step REDIS: record + DEL worker checkpoints, RENAME DLQ and last_known keys',
    ACTIVE: 'step ACTIVE: commit point (registry active = new escrow, ACTIVE)',
    VERIFY: 'step VERIFY: read-back; state VERIFIED',
  };
  for (const s of order.slice(order.indexOf(from))) ctx.out(`would run ${text[s]}`);
  ctx.out('dry-run: nothing written. Re-run with --apply.');
}

// ── RESTORE (tasarım §4) ─────────────────────────────────────────────────────
async function restore(ctx) {
  const { cfg, mongo, redis, out, apply, now } = ctx;
  out(`mode: ${apply ? 'APPLY' : 'DRY-RUN'} restore ${cfg.archiveId}`);
  const m = await mongo.getDoc(cfg.archiveId);
  if (!m) fail('no manifest for this archive id.');
  const newEsc = String(m.new_escrow || '').toLowerCase();
  if (cfg.new && cfg.new !== newEsc) fail('ARAF_ESCROW_ADDRESS does not equal the manifest new escrow.');
  if (Number(m.chain_id) !== cfg.chainId) fail('manifest chain does not equal EXPECTED_CHAIN_ID.');
  const targetBlock = Number(m.old_deploy_block);
  if (m.old_deploy_block === null || m.old_deploy_block === undefined || !Number.isInteger(targetBlock) || targetBlock < 1) {
    fail('manifest old_deploy_block is missing or invalid; refusing to restore (nothing was written).');
  }
  const rs = m.restore ? m.restore.state : null;
  if (!rs && m.state !== 'VERIFIED') fail('only a VERIFIED rotation can be restored.');
  if (rs && !RESTORE_STATES.includes(rs)) fail('manifest has an unknown restore state.');

  const reg = await mongo.getDoc('active');
  if (!reg) fail('registry active document is missing.');
  const regAddr = String(reg.escrow_address || '').toLowerCase();
  const ridx = rs ? RESTORE_STATES.indexOf(rs) : -1;
  if (ridx < RESTORE_STATES.indexOf('R_ACTIVE_SWITCHED') && regAddr !== newEsc) fail('registry active is not the rotated (new) escrow.');
  if (ridx >= RESTORE_STATES.indexOf('R_ACTIVE_SWITCHED') && regAddr !== cfg.old) fail('registry active is not the old escrow although the switch was recorded.');
  if (rs) out(`resuming restore at ${rs}`);

  const r = m.restore || { state: null, collections_current: {}, collections_old: {}, redis_current: {}, redis_old: {}, users_phase: null };
  m.restore = r;
  const saveR = async () => { if (apply) await mongo.setDoc(cfg.archiveId, { restore: r }); };
  const advance = async (state) => {
    r.state = state; r.steps = { ...(r.steps || {}), [state]: now() };
    await saveR();
    out(`restore state -> ${state}`);
  };
  const at = (s) => RESTORE_STATES.indexOf(s);
  const curId = archiveId(cfg.chainId, newEsc);
  const curStamp = { id: curId, escrow_address: newEsc, chain_id: cfg.chainId, archived_at: new Date(r.started_at || now()) };

  if (!rs) {
    out('step R_PLANNED: registry active.state=ROTATING');
    r.started_at = curStamp.archived_at;
    r.actor = cfg.actor; r.github_run_id = cfg.runId;
    if (apply) await mongo.setDoc('active', { state: 'ROTATING', updated_by: `github-run-${cfg.runId}` });
    await advance('R_PLANNED');
  } else if (apply && ridx < at('R_ACTIVE_SWITCHED') && reg.state !== 'ROTATING') {
    await mongo.setDoc('active', { state: 'ROTATING', updated_by: `github-run-${cfg.runId}` });
  }

  if (at(r.state) < at('R_MONGO_DONE')) {
    out('step MONGO (A): current live collections -> archive of the current escrow (nothing is deleted)');
    for (const c of COLLECTIONS) {
      await moveCollection(ctx, r.collections_current, c, c, archiveName(cfg.chainId, newEsc, c), { stamp: curStamp, persist: saveR });
    }
    out('step MONGO (B): archive of the old escrow -> live names (manifest values are the verification baseline)');
    for (const c of COLLECTIONS) {
      const exp = m.collections && m.collections[c];
      if (!exp || exp.status === 'ABSENT') { out(`  ${c}: absent in manifest (skip)`); continue; }
      await moveCollection(ctx, r.collections_old, c, archiveName(cfg.chainId, cfg.old, c), c, {
        unstamp: true, expected: exp.pre, persist: saveR, targetWillBeFree: true,
      });
    }
    await advance('R_MONGO_DONE');
    if (!apply) return dryTail(ctx);
  }
  if (at(r.state) < at('R_USERS_DONE')) {
    const curColl = archiveName(cfg.chainId, newEsc, USER_MIRROR_SUFFIX);
    const oldColl = archiveName(cfg.chainId, cfg.old, USER_MIRROR_SUFFIX);
    out('step USERS: archive current mirror, then $set the old mirror image');
    if (r.users_phase !== 'CURRENT_ARCHIVED') {
      const a = await archiveUserMirror(ctx, { aid: curId, archiveColl: curColl, archivedAt: curStamp.archived_at });
      out(`  current mirrors archived: ${a.archived}`);
      r.users_phase = 'CURRENT_ARCHIVED';
      await saveR();
    }
    if (await mongo.collectionExists(oldColl)) {
      const n = await restoreUserMirror(ctx, oldColl);
      out(`  old mirror images restored: ${n}`);
    } else out('  no old mirror archive collection (nothing to restore)');
    await advance('R_USERS_DONE');
    if (!apply) return dryTail(ctx);
  }
  if (at(r.state) < at('R_REDIS_DONE')) {
    out('step REDIS: current keys -> archive of current escrow; old archive keys -> live; checkpoints from manifest');
    await moveRedisKeys(ctx, r.redis_current, redisMoves(cfg.chainId, newEsc).map((x) => ({ from: x.live, to: x.archive })), saveR);
    await moveRedisKeys(ctx, r.redis_old, redisMoves(cfg.chainId, cfg.old).map((x) => ({ from: x.archive, to: x.live })), saveR);
    const cp = (m.redis && m.redis.checkpoints) || {};
    for (const k of CHECKPOINT_KEYS) {
      const v = cp[k];
      out(`  checkpoint ${k}: ${v === null || v === undefined ? 'DEL (none recorded)' : `SET ${v}`}`);
      if (apply) { if (v === null || v === undefined) await redis.del(k); else await redis.set(k, String(v)); }
    }
    await advance('R_REDIS_DONE');
    if (!apply) return dryTail(ctx);
  }
  if (at(r.state) < at('R_ACTIVE_SWITCHED')) {
    out('step ACTIVE: commit point (registry active = old escrow, ACTIVE)');
    if (apply) {
      await mongo.replaceDoc('active', {
        _id: 'active',
        escrow_address: cfg.old,
        chain_id: cfg.chainId,
        deploy_block: targetBlock,
        state: 'ACTIVE',
        since: now(),
        updated_by: `github-run-${cfg.runId}`,
      });
    }
    await advance('R_ACTIVE_SWITCHED');
  }
  if (at(r.state) < at('R_VERIFIED')) {
    out('step VERIFY: read-back');
    if (apply) {
      const cur = await mongo.getDoc('active');
      if (!cur || String(cur.escrow_address).toLowerCase() !== cfg.old || cur.state !== 'ACTIVE') fail('VERIFY FAILED: registry active is not the old escrow/ACTIVE.');
      for (const c of COLLECTIONS) {
        const exp = m.collections && m.collections[c];
        if (!exp || exp.status === 'ABSENT') continue;
        if ((await mongo.countDocs(c)) !== exp.pre.count) fail(`VERIFY FAILED: live ${c} count differs from manifest.`);
      }
    }
    await advance('R_VERIFIED');
  }
  if (apply) {
    out('restore VERIFIED. Fly env / repo variables must be switched to the values below by the workflow.');
    out(`RESTORE_TARGET_ESCROW=${cfg.old}`);
    out(`RESTORE_TARGET_DEPLOY_BLOCK=${targetBlock}`);
  } else out('dry-run: nothing written. Re-run with --apply.');
  return 0;
}
function dryTail(ctx) {
  ctx.out('would run the remaining restore steps (USERS, REDIS, ACTIVE, VERIFY).');
  ctx.out('dry-run: nothing written. Re-run with --apply.');
  return 0;
}

// ── Giriş ────────────────────────────────────────────────────────────────────
async function run({ argv = process.argv.slice(2), env = process.env, deps = {}, out = console.log, now = () => new Date() } = {}) {
  const args = parseArgs(argv);
  if (args.unknown.length) {
    out('usage: rotate-escrow.js --precheck | --rotate [--apply] | --restore <chainId>:<oldEscrow> [--apply]');
    return 2;
  }
  let cfg;
  try {
    cfg = readConfig(env, args);
  } catch (e) {
    out(`::error::${e.safe ? e.message : 'invalid configuration'}`);
    return 1;
  }

  const owned = [];
  try {
    const adapters = () => require('./lib/rotate-escrow-adapters');
    const mongo = deps.mongo || (() => { const x = adapters().createMongo(env.MONGODB_URI, { mirrorFields: MIRROR_FIELDS }); owned.push(x); return x; })();
    let redis = deps.redis;
    if (redis === undefined && String(env.REDIS_URL || '').trim()) {
      redis = adapters().createRedis(env.REDIS_URL, env);
      owned.push(redis);
    }
    let chain = deps.chain;
    if (chain === undefined && cfg.hasRpc) {
      chain = adapters().createChain(env.RPC_URL);
      owned.push(chain);
    }
    const ctx = { cfg, mongo, redis: redis || null, chain: chain || null, out, apply: args.apply, now };
    if (args.precheck) return await precheck(ctx);
    if (args.rotate) return await rotate(ctx);
    return await restore(ctx);
  } catch (e) {
    // Sürücü hata metni host/URI içerebilir: yalnız güvenli (kendi) mesajlar veya hata adı basılır.
    out(e && e.safe ? `::error::${e.message}` : `::error::operation failed (${(e && e.name) || 'Error'}).`);
    return 1;
  } finally {
    for (const o of owned) { try { await o.close(); } catch { /* ignore */ } }
  }
}

module.exports = {
  run, parseArgs, readConfig, archiveName, archiveId, canonicalJson, hashCollection, indexSetKey, pickMirror,
  isDefaultMirror, mirrorDefaults, redisMoves, moveCollection, COLLECTIONS, MIRROR_FIELDS, STATES, ARCHIVE_NAME_RE,
};

if (require.main === module) {
  run().then((code) => process.exit(code));
}
