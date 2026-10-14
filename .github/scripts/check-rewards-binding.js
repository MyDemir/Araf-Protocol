#!/usr/bin/env node
/**
 * [TR] Vault/rewards'ın verilen escrow'a bağlı olduğunu zincirden doğrular (bağımlılıksız: node fetch + eth_call).
 *   Kontroller: vault.escrow() == ESCROW, rewards.escrow() == ESCROW, rewards.revenueVault() == REVENUE_VAULT.
 *   Selector'lar keccak256'dan hesaplanır. Okuma hatası da uyumsuzluk sayılır.
 *   ON_MISMATCH=error : ::error:: + exit 1 (manifest modu, runtime workflow).
 *   ON_MISMATCH=clear : ::warning:: + GITHUB_ENV'e REVENUE_VAULT= REWARDS= REWARDS_UNBOUND=1 (tam deploy, fallback):
 *                       vault/rewards runtime'a verilmez ve Fly/Vercel'deki eski değerler boşaltılır.
 *   REVENUE_VAULT ve REWARDS boşsa hiçbir şey yapmaz.
 * [EN] Verifies on chain that vault/rewards are bound to ESCROW. Read errors count as mismatch.
 */
'use strict';
const fs = require('fs');
const { keccak256Hex, normalizeAddress } = require('./resolve-rewards-addresses');

const selector = (sig) => '0x' + keccak256Hex(sig).slice(0, 8);
const SEL = {
  escrow: selector('escrow()'),
  revenueVault: selector('revenueVault()'),
};

async function ethCallAddress(rpcUrl, to, data, fetchImpl) {
  const res = await fetchImpl(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error ${json.error.code}`);
  const r = String(json.result || '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(r)) throw new Error('unexpected eth_call result');
  // ABI address = 32 bayt; üst 12 bayt sıfır olmalı (aksi halde dönüş bir adres değildir).
  if (!/^0x0{24}/.test(r)) throw new Error('eth_call result is not an ABI-encoded address (upper 12 bytes non-zero)');
  return normalizeAddress('result', '0x' + r.slice(26)) || '0x0000000000000000000000000000000000000000';
}

/** @returns {Promise<{ok:boolean, problems:string[]}>} */
async function checkRewardsBinding({ rpcUrl, escrow, vault, rewards, fetchImpl = globalThis.fetch }) {
  const e = normalizeAddress('ESCROW', escrow);
  const v = normalizeAddress('REVENUE_VAULT', vault);
  const r = normalizeAddress('REWARDS', rewards);
  if (!v && !r) return { ok: true, problems: [], skipped: true };
  if (!e || !v || !r) return { ok: false, problems: ['ESCROW, REVENUE_VAULT and REWARDS are all required for the binding check'] };
  if (!rpcUrl) return { ok: false, problems: ['RPC URL missing (cannot read chain)'] };
  const problems = [];
  const checks = [
    ['vault.escrow()', v, SEL.escrow, e],
    ['rewards.escrow()', r, SEL.escrow, e],
    ['rewards.revenueVault()', r, SEL.revenueVault, v],
  ];
  for (const [label, to, data, expected] of checks) {
    try {
      const got = await ethCallAddress(rpcUrl, to, data, fetchImpl);
      if (got.toLowerCase() !== expected.toLowerCase()) problems.push(`${label}=${got} expected ${expected}`);
    } catch (err) {
      problems.push(`${label} read failed (${err.message})`);
    }
  }
  return { ok: problems.length === 0, problems };
}

async function cli(env = process.env) {
  const mode = env.ON_MISMATCH;
  if (mode !== 'error' && mode !== 'clear') throw new Error('ON_MISMATCH must be error or clear');
  const res = await checkRewardsBinding({
    rpcUrl: env.BASE_SEPOLIA_RPC_URL, escrow: env.ESCROW, vault: env.REVENUE_VAULT, rewards: env.REWARDS,
  });
  if (res.skipped) { console.log('No vault/rewards configured; binding check skipped.'); return 0; }
  if (res.ok) {
    console.log(`Vault/rewards are bound to escrow ${env.ESCROW}.`);
    if (env.GITHUB_ENV) fs.appendFileSync(env.GITHUB_ENV, 'REWARDS_BOUND=1\n');
    return 0;
  }
  const msg = `vault/rewards are NOT bound to escrow ${env.ESCROW}: ${res.problems.join('; ')}`;
  if (mode === 'error') { console.error(`::error::${msg}`); return 1; }
  console.log(`::warning::${msg}. They will NOT be given to the runtime and the Fly/Vercel values are cleared; re-run with deploy_rewards=true.`);
  if (env.GITHUB_ENV) fs.appendFileSync(env.GITHUB_ENV, 'REVENUE_VAULT=\nREWARDS=\nREWARDS_UNBOUND=1\n');
  return 0;
}

if (require.main === module) {
  cli().then((code) => process.exit(code)).catch((e) => { console.error(`::error::${e.message}`); process.exit(1); });
}

module.exports = { SEL, selector, checkRewardsBinding, cli };
