#!/usr/bin/env node
// [TR] "Aktif escrow" kaydının TEK yazarı (backend bu kaydı yalnız okur; bkz. backend/scripts/services/escrowRegistryGuard.js).
//      Mongo `escrow_registry` koleksiyonundaki `_id:"active"` belgesini oluşturur/günceller.
//        node .github/scripts/escrow-registry.js --adopt [--apply] [--force-switch]
//      VARSAYILAN dry-run: yalnız ne yazacağını yazdırır (mevcut belge OKUNUR, hiçbir şey yazılmaz). Yazma için açık --apply.
//      Mevcut active BAŞKA bir escrow/zincir gösteriyorsa --force-switch olmadan DURUR. State ROTATING ise
//      --force-switch ile bile HER KOŞULDA durur: rotasyonu yalnız rotate-escrow.yml (rotate-escrow.js) tamamlar.
//        node .github/scripts/escrow-registry.js --status   # salt okur: "registry_state=none|ACTIVE|ROTATING"
//      Girdiler yalnız env'den: MONGODB_URI ARAF_ESCROW_ADDRESS EXPECTED_CHAIN_ID
//      ARAF_DEPLOYMENT_BLOCK GITHUB_RUN_ID (opsiyonel). MONGODB_URI / secret hiçbir koşulda yazdırılmaz.
//      Mongo sürücüsü yeni bağımlılık değildir: backend/node_modules (npm ci --prefix backend) içinden yüklenir.
// [EN] Sole writer of the "active escrow" registry document. Dry-run by default; --apply to write;
//      --force-switch to replace a different active escrow. Never prints the URI.
'use strict';
const path = require('path');

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = '0x' + '0'.repeat(40);
const POSITIVE_INT_RE = /^[1-9][0-9]{0,15}$/;
const RUN_ID_RE = /^[0-9]{1,20}$/;

function parseArgs(argv) {
  const flags = new Set(argv);
  const known = new Set(['--adopt', '--apply', '--force-switch', '--status']);
  const unknown = argv.filter((a) => !known.has(a));
  return { status: flags.has('--status'), adopt: flags.has('--adopt'), apply: flags.has('--apply'), forceSwitch: flags.has('--force-switch'), unknown };
}

function buildDesired(env) {
  const address = String(env.ARAF_ESCROW_ADDRESS || '').trim();
  if (!ADDRESS_RE.test(address) || address.toLowerCase() === ZERO_ADDRESS) {
    throw new Error('ARAF_ESCROW_ADDRESS must be a non-zero 0x + 40 hex address.');
  }
  const chain = String(env.EXPECTED_CHAIN_ID || '').trim();
  if (!POSITIVE_INT_RE.test(chain)) throw new Error('EXPECTED_CHAIN_ID must be a positive integer.');
  const block = String(env.ARAF_DEPLOYMENT_BLOCK || '').trim();
  if (!POSITIVE_INT_RE.test(block)) throw new Error('ARAF_DEPLOYMENT_BLOCK must be a positive integer.');
  const runId = String(env.GITHUB_RUN_ID || '').trim();
  if (runId && !RUN_ID_RE.test(runId)) throw new Error('GITHUB_RUN_ID must be numeric.');
  return {
    escrow_address: address.toLowerCase(),
    chain_id: Number(chain),
    deploy_block: Number(block),
    state: 'ACTIVE',
    updated_by: runId ? `github-run-${runId}` : 'manual',
  };
}

// Mevcut belgenin istenenle aynı escrow/zincir/ACTIVE olup olmadığı.
function sameTarget(existing, desired) {
  return String(existing.escrow_address || '').toLowerCase() === desired.escrow_address
    && Number(existing.chain_id) === desired.chain_id
    && existing.state === 'ACTIVE';
}

function describe(doc) {
  return `escrow=${doc.escrow_address} chain=${doc.chain_id} block=${doc.deploy_block} state=${doc.state}`;
}

function createMongoStore(uri) {
  let driver;
  try {
    driver = require(require.resolve('mongodb', { paths: [path.resolve(__dirname, '../../backend')] }));
  } catch {
    const err = new Error('mongodb driver not found; run "npm ci --omit=dev --prefix backend" first.');
    err.safe = true;
    throw err;
  }
  const client = new driver.MongoClient(uri, { serverSelectionTimeoutMS: 15000, appName: 'araf-escrow-registry' });
  let coll = null;
  const open = async () => {
    if (coll) return coll;
    await client.connect();
    coll = client.db().collection('escrow_registry');
    return coll;
  };
  return {
    async read() { return (await open()).findOne({ _id: 'active' }); },
    // K4-20(a): okuma ile yazma arasında ROTATING'e geçilmişse ezilmez; upsert aynı _id'yi eklemeye çalışıp 11000 verir (fail-closed).
    async write(doc) {
      try {
        await (await open()).replaceOne({ _id: 'active', state: { $ne: 'ROTATING' } }, doc, { upsert: true });
      } catch (e) {
        if (e && e.code === 11000) {
          const err = new Error('Registry is ROTATING (changed after it was read); refusing to overwrite. Complete the rotation with rotate-escrow.yml.');
          err.safe = true;
          throw err;
        }
        throw e;
      }
    },
    async close() { await client.close().catch(() => {}); },
  };
}

async function run({ argv = process.argv.slice(2), env = process.env, store, out = console.log, now = () => new Date() } = {}) {
  const args = parseArgs(argv);
  if (args.unknown.length || (!args.adopt && !args.status) || (args.adopt && args.status)) {
    out('usage: escrow-registry.js --adopt [--apply] [--force-switch]   (default: dry-run) | --status');
    return 2;
  }

  // Salt okur durum sorgusu: yalnız MONGODB_URI gerekir; hiçbir şey yazılmaz.
  if (args.status) {
    if (!env.MONGODB_URI && !store) {
      out('::error::MONGODB_URI is required.');
      return 1;
    }
    let st = store;
    try {
      st = st || createMongoStore(env.MONGODB_URI);
      const existing = await st.read();
      out(`registry_state=${existing ? (existing.state === 'ROTATING' ? 'ROTATING' : existing.state === 'ACTIVE' ? 'ACTIVE' : 'UNKNOWN') : 'none'}`);
      return 0;
    } catch (e) {
      out(e && e.safe ? `::error::${e.message}` : `::error::registry operation failed (${(e && e.name) || 'Error'}).`);
      return 1;
    } finally {
      if (st && !store) await st.close();
    }
  }

  let desired;
  try {
    desired = buildDesired(env);
  } catch (e) {
    out(`::error::${e.message}`);
    return 1;
  }
  if (!env.MONGODB_URI && !store) {
    out('::error::MONGODB_URI is required.');
    return 1;
  }

  let s = store;
  try {
    s = s || createMongoStore(env.MONGODB_URI);
    const existing = await s.read();
    let doc = { ...desired, since: now() };
    let action = 'create';

    if (existing) {
      // ROTATING: rotasyon yarım; --force-switch dahil HİÇBİR koşulda ezilmez (DEVAM_NOTLARI 4.5/3).
      if (existing.state === 'ROTATING') {
        out(`::error::Registry state is ROTATING (${describe(existing)}). A rotation is in progress or was interrupted; refusing to overwrite even with --force-switch. Complete the rotation with the rotate-escrow.yml workflow.`);
        return 1;
      }
      if (sameTarget(existing, desired)) {
        action = 'update (same escrow)';
        doc.since = existing.since || doc.since;
      } else if (!args.forceSwitch) {
        out(`::error::An active registry document already points at a different escrow/chain or is not ACTIVE (${describe(existing)}). Refusing to overwrite without --force-switch.`);
        return 1;
      } else {
        action = 'SWITCH (force)';
      }
    }

    out(`mode: ${args.apply ? 'APPLY' : 'DRY-RUN'}`);
    out(`action: ${action}`);
    out(`current: ${existing ? describe(existing) : '(none)'}`);
    out(`desired: ${describe(doc)} updated_by=${doc.updated_by}`);

    if (!args.apply) {
      out('dry-run: nothing written. Re-run with --apply to write.');
      return 0;
    }
    await s.write({ _id: 'active', ...doc });
    out('escrow_registry active document written.');
    return 0;
  } catch (e) {
    // Mongo hata metni host/URI içerebilir: yalnız hata adı basılır.
    out(e && e.safe ? `::error::${e.message}` : `::error::registry operation failed (${(e && e.name) || 'Error'}).`);
    return 1;
  } finally {
    if (s && !store) await s.close();
  }
}

module.exports = { run, buildDesired, parseArgs, sameTarget, createMongoStore };

if (require.main === module) {
  run().then((code) => process.exit(code));
}
