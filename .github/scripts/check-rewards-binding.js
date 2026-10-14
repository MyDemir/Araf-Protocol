#!/usr/bin/env node
/**
 * [TR] Vault/rewards'ın verilen escrow'a bağlı olduğunu zincirden doğrular (bağımlılıksız: node fetch + eth_call).
 *   Kontroller: vault.escrow() == ESCROW, rewards.escrow() == ESCROW, rewards.revenueVault() == REVENUE_VAULT.
 *   Selector'lar keccak256'dan hesaplanır.
 *   Okuma hatası (RPC) uyumsuzluk SAYILMAZ: geçici hatalarda (429, 5xx, ağ, -32005/rate-limit) üstel bekleme ile
 *   yeniden denenir, sonra BASE_SEPOLIA_RPC_URL_FALLBACKS (virgüllü, yalnız https://) sırayla denenir.
 *   Hâlâ okunamazsa İKİ modda da ::error:: + exit 1; hiçbir şey boşaltılmaz, GITHUB_ENV'e yazılmaz.
 *   Revert / geçersiz sonuç: retry yok, okuma hatası olarak başarısız.
 *   ON_MISMATCH=error : (gerçek uyumsuzluk) ::error:: + exit 1 (manifest modu, runtime workflow).
 *   ON_MISMATCH=clear : (gerçek uyumsuzluk) ::warning:: + GITHUB_ENV'e REVENUE_VAULT= REWARDS= REWARDS_UNBOUND=1
 *                       (tam deploy, fallback): vault/rewards runtime'a verilmez, Fly/Vercel eski değerleri boşaltılır.
 *   REVENUE_VAULT ve REWARDS boşsa hiçbir şey yapmaz.
 *   RPC URL'leri (API anahtarı içerir) hiçbir mesaja basılmaz; yalnız primary / fallback[i] etiketi.
 * [EN] Verifies on chain that vault/rewards are bound to ESCROW. Read errors are NOT mismatches: retried
 *      with backoff, then fallbacks, then fail in both modes without clearing anything.
 */
'use strict';
const fs = require('fs');
const { keccak256Hex, normalizeAddress } = require('./resolve-rewards-addresses');

const selector = (sig) => '0x' + keccak256Hex(sig).slice(0, 8);
const SEL = {
  escrow: selector('escrow()'),
  revenueVault: selector('revenueVault()'),
};

const DEFAULTS = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 8000, totalBudgetMs: 30000, requestTimeoutMs: 10000 };
const ZERO = '0x0000000000000000000000000000000000000000';

/** Geçici hata: yeniden denenebilir (429, 5xx, ağ, -32005 / rate-limit). */
function transientError(message) {
  const e = new Error(message);
  e.transient = true;
  return e;
}

// NOT: hata mesajları RPC URL'sini (API anahtarı içerir) ASLA içermez.
async function ethCallAddress(rpcUrl, to, data, fetchImpl, timeoutMs = DEFAULTS.requestTimeoutMs) {
  let res;
  try {
    res = await fetchImpl(rpcUrl, {
      signal: AbortSignal.timeout(timeoutMs),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw transientError('request timeout');
    const code = err && (err.code || (err.cause && err.cause.code));
    throw transientError(`network error${code ? ` ${String(code).replace(/[^A-Za-z0-9_]/g, '')}` : ''}`);
  }
  if (!res.ok) {
    const msg = `RPC HTTP ${res.status}`;
    if (res.status === 429 || res.status >= 500) throw transientError(msg);
    throw new Error(msg);
  }
  let json;
  try { json = await res.json(); } catch (_) { throw transientError('RPC response is not valid JSON'); }
  if (json.error) {
    const code = json.error.code;
    const text = String(json.error.message || '');
    const msg = `RPC error ${code}`;
    if (code === -32005 || code === 429 || /rate.?limit|too many requests|capacity exceeded/i.test(text)) throw transientError(msg);
    throw new Error(msg);
  }
  const r = String(json.result || '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(r)) throw new Error('unexpected eth_call result');
  // ABI address = 32 bayt; üst 12 bayt sıfır olmalı (aksi halde dönüş bir adres değildir).
  if (!/^0x0{24}/.test(r)) throw new Error('eth_call result is not an ABI-encoded address (upper 12 bytes non-zero)');
  return normalizeAddress('result', '0x' + r.slice(26)) || ZERO;
}

/** Virgüllü, yalnız https:// fallback listesi. */
function parseFallbacks(raw) {
  return String(raw || '').split(',').map((x) => x.trim()).filter((x) => /^https:\/\/\S+$/i.test(x));
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** @returns {Promise<{ok:boolean, problems:string[], readErrors:string[]}>} */
async function checkRewardsBinding({
  rpcUrl, fallbackUrls = [], escrow, vault, rewards,
  fetchImpl = globalThis.fetch, sleep = defaultSleep,
  maxAttempts = DEFAULTS.maxAttempts, baseDelayMs = DEFAULTS.baseDelayMs,
  maxDelayMs = DEFAULTS.maxDelayMs, totalBudgetMs = DEFAULTS.totalBudgetMs,
  requestTimeoutMs = DEFAULTS.requestTimeoutMs,
}) {
  const e = normalizeAddress('ESCROW', escrow);
  const v = normalizeAddress('REVENUE_VAULT', vault);
  const r = normalizeAddress('REWARDS', rewards);
  if (!v && !r) return { ok: true, problems: [], readErrors: [], skipped: true };
  if (!e || !v || !r) return { ok: false, problems: ['ESCROW, REVENUE_VAULT and REWARDS are all required for the binding check'], readErrors: [] };
  if (!rpcUrl) return { ok: false, problems: [], readErrors: ['RPC URL missing (cannot read chain)'] };
  const endpoints = [{ label: 'primary', url: rpcUrl }, ...fallbackUrls.map((url, i) => ({ label: `fallback[${i}]`, url }))];
  const problems = [];
  const readErrors = [];
  let slept = 0;
  let start = 0;

  async function readOne(to, data) {
    let lastMsg = 'no endpoint available';
    for (let i = start; i < endpoints.length; i += 1) {
      const ep = endpoints[i];
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const got = await ethCallAddress(ep.url, to, data, fetchImpl, requestTimeoutMs);
          start = i;
          return got;
        } catch (err) {
          lastMsg = `${err.message} [${ep.label}]`;
          if (!err.transient) throw new Error(lastMsg); // revert / geçersiz sonuç: retry ve fallback yok
          if (attempt === maxAttempts) break;
          const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
          if (slept + delay > totalBudgetMs) break;
          slept += delay;
          await sleep(delay);
        }
      }
    }
    throw new Error(`${lastMsg}; all endpoints exhausted`);
  }

  const checks = [
    ['vault.escrow()', v, SEL.escrow, e],
    ['rewards.escrow()', r, SEL.escrow, e],
    ['rewards.revenueVault()', r, SEL.revenueVault, v],
  ];
  for (const [label, to, data, expected] of checks) {
    try {
      const got = await readOne(to, data);
      if (got.toLowerCase() !== expected.toLowerCase()) problems.push(`${label}=${got} expected ${expected}`);
    } catch (err) {
      readErrors.push(`${label} read failed (${err.message})`);
    }
  }
  return { ok: problems.length === 0 && readErrors.length === 0, problems, readErrors };
}

async function cli(env = process.env, opts = {}) {
  const mode = env.ON_MISMATCH;
  if (mode !== 'error' && mode !== 'clear') throw new Error('ON_MISMATCH must be error or clear');
  const res = await checkRewardsBinding({
    rpcUrl: env.BASE_SEPOLIA_RPC_URL, fallbackUrls: parseFallbacks(env.BASE_SEPOLIA_RPC_URL_FALLBACKS),
    escrow: env.ESCROW, vault: env.REVENUE_VAULT, rewards: env.REWARDS, ...opts,
  });
  if (res.skipped) { console.log('No vault/rewards configured; binding check skipped.'); return 0; }
  if (res.readErrors.length > 0) {
    // Okuma hatası uyumsuzluk DEĞİLDİR: iki modda da dur, hiçbir şeyi boşaltma.
    console.error(`::error::could not read binding from chain (RPC unavailable); NOT clearing anything: ${[...res.readErrors, ...res.problems].join('; ')}`);
    return 1;
  }
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

module.exports = { SEL, selector, checkRewardsBinding, parseFallbacks, cli };
