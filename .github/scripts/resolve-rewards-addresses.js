#!/usr/bin/env node
/**
 * [TR] Revenue vault + rewards adreslerini iki deploy workflow'u için TEK kurala göre çözer (bağımlılıksız).
 *   MODE=manifest : deploy_rewards=true. Kaynak deployments/<ağ>-rewards.json. Manifest.escrow == ESCROW ve
 *                   chainId == EXPECTED_CHAIN_ID olmalı. Repo variable'ları doluysa ve farklıysa HATA
 *                   (ALLOW_VARS_REPLACE=true yalnız confirm_redeploy_rewards=YES iken).
 *   MODE=fallback : Kaynak repo variable'ları (VAR_*); dolu input override (INPUT_*) önceliklidir.
 *                   Runner'da manifest varsa ve seçilen değerle çelişirse HATA.
 *   Her adres: 0x+40 hex, sıfır değil, karışık harfliyse EIP-55 checksum geçerli. Çıktı checksum'lı.
 *   Vault ve rewards birlikte verilmeli (biri boş diğeri dolu = HATA).
 *   Çıktı: REVENUE_VAULT, REWARDS, REWARDS_SOURCE (manifest|input|vars|none) → $GITHUB_ENV (yoksa stdout).
 * [EN] Resolves vault/rewards addresses for both deploy workflows with one rule set (no dependencies).
 */
'use strict';
const fs = require('fs');

// ---- keccak256 (EIP-55 checksum için; Keccak-f[1600], 0x01 padding) ----
const RC = [
  '0x0000000000000001', '0x0000000000008082', '0x800000000000808a', '0x8000000080008000', '0x000000000000808b',
  '0x0000000080000001', '0x8000000080008081', '0x8000000000008009', '0x000000000000008a', '0x0000000000000088',
  '0x0000000080008009', '0x000000008000000a', '0x000000008000808b', '0x800000000000008b', '0x8000000000008089',
  '0x8000000000008003', '0x8000000000008002', '0x8000000000000080', '0x000000000000800a', '0x800000008000000a',
  '0x8000000080008081', '0x8000000000008080', '0x0000000080000001', '0x8000000080008008',
].map(BigInt);
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);

function keccakF(s) {
  for (let round = 0; round < 24; round++) {
    const c = [0, 1, 2, 3, 4].map((x) => s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20]);
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    const b = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], ROT[x + 5 * y]);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 25; y += 5) s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & M64 & b[((x + 2) % 5) + y]);
    s[0] ^= RC[round];
  }
}

function keccak256Hex(input) {
  const rate = 136;
  const bytes = Buffer.from(input, 'utf8');
  const padLen = rate - (bytes.length % rate);
  const msg = Buffer.concat([bytes, Buffer.alloc(padLen)]);
  msg[bytes.length] ^= 0x01;
  msg[msg.length - 1] ^= 0x80;
  const s = new Array(25).fill(0n);
  for (let off = 0; off < msg.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) s[i] ^= msg.readBigUInt64LE(off + i * 8);
    keccakF(s);
  }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) out.writeBigUInt64LE(s[i], i * 8);
  return out.toString('hex');
}

const ZERO = '0x0000000000000000000000000000000000000000';

function toChecksumAddress(addr) {
  const lower = addr.toLowerCase().replace(/^0x/, '');
  const hash = keccak256Hex(lower);
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

/** Boşsa null; geçersizse hata; geçerliyse checksum'lı adres. */
function normalizeAddress(name, value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${name} must be a 0x + 40 hex address`);
  if (v.toLowerCase() === ZERO) throw new Error(`${name} must not be the zero address`);
  const body = v.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  const cs = toChecksumAddress(v);
  if (mixed && cs !== v) throw new Error(`${name} has an invalid EIP-55 checksum`);
  return cs;
}

function pair(label, vault, rewards) {
  if (!!vault !== !!rewards) throw new Error(`${label}: revenue vault and rewards must be set together (got vault=${vault || 'empty'}, rewards=${rewards || 'empty'})`);
  return { vault, rewards };
}

const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function resolveRewardsAddresses(env, readManifest) {
  const mode = env.MODE;
  if (mode !== 'manifest' && mode !== 'fallback') throw new Error('MODE must be manifest or fallback');
  const vars = pair('repository variables ARAF_REVENUE_VAULT_ADDRESS/ARAF_REWARDS_ADDRESS',
    normalizeAddress('ARAF_REVENUE_VAULT_ADDRESS (variable)', env.VAR_REVENUE_VAULT),
    normalizeAddress('ARAF_REWARDS_ADDRESS (variable)', env.VAR_REWARDS));
  const inputs = pair('inputs revenue_vault_address/rewards_address',
    normalizeAddress('revenue_vault_address (input)', env.INPUT_REVENUE_VAULT),
    normalizeAddress('rewards_address (input)', env.INPUT_REWARDS));
  const manifest = env.MANIFEST_PATH ? readManifest(env.MANIFEST_PATH) : null;
  const escrow = normalizeAddress('ESCROW', env.ESCROW);

  let fromManifest = null;
  if (manifest) {
    if (env.EXPECTED_CHAIN_ID && Number(manifest.chainId) !== Number(env.EXPECTED_CHAIN_ID)) {
      throw new Error(`rewards manifest chainId ${manifest.chainId} != expected ${env.EXPECTED_CHAIN_ID}`);
    }
    fromManifest = pair('rewards manifest',
      normalizeAddress('manifest.vault', manifest.vault),
      normalizeAddress('manifest.rewards', manifest.rewards));
    const mEscrow = normalizeAddress('manifest.escrow', manifest.escrow);
    if (escrow && mEscrow && !same(escrow, mEscrow)) {
      throw new Error(`rewards manifest escrow ${mEscrow} != deployed escrow ${escrow}`);
    }
  }

  if (mode === 'manifest') {
    if (!fromManifest || !fromManifest.vault) throw new Error('deploy_rewards=true but the rewards manifest is missing or empty');
    if (inputs.vault) throw new Error('vault/rewards input overrides are not allowed when deploying rewards');
    if (vars.vault && (!same(vars.vault, fromManifest.vault) || !same(vars.rewards, fromManifest.rewards)) && env.ALLOW_VARS_REPLACE !== 'true') {
      throw new Error(
        `manifest (vault=${fromManifest.vault}, rewards=${fromManifest.rewards}) conflicts with repository variables ` +
        `(vault=${vars.vault}, rewards=${vars.rewards}). Use confirm_redeploy_rewards=YES to replace them.`
      );
    }
    return { vault: fromManifest.vault, rewards: fromManifest.rewards, source: 'manifest' };
  }

  const chosen = inputs.vault ? { ...inputs, source: 'input' } : vars.vault ? { ...vars, source: 'vars' } : { vault: null, rewards: null, source: 'none' };
  if (fromManifest && fromManifest.vault && chosen.vault &&
      (!same(chosen.vault, fromManifest.vault) || !same(chosen.rewards, fromManifest.rewards))) {
    throw new Error(`${chosen.source} (vault=${chosen.vault}, rewards=${chosen.rewards}) conflicts with rewards manifest (vault=${fromManifest.vault}, rewards=${fromManifest.rewards})`);
  }
  return chosen;
}

function readManifestFile(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

if (require.main === module) {
  try {
    const r = resolveRewardsAddresses(process.env, readManifestFile);
    const lines = [`REVENUE_VAULT=${r.vault || ''}`, `REWARDS=${r.rewards || ''}`, `REWARDS_SOURCE=${r.source}`];
    if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, lines.join('\n') + '\n');
    console.log(lines.join('\n'));
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}

module.exports = { keccak256Hex, toChecksumAddress, normalizeAddress, resolveRewardsAddresses, readManifestFile };
