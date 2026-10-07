#!/usr/bin/env node
"use strict";

// [TR] Yerel kurulum: eksik .env dosyalarını .env.example'dan oluşturur; backend/.env'de JWT_SECRET ve
//      MASTER_ENCRYPTION_KEY için güvenli rastgele değer üretir. Var olan .env'ye DOKUNMAZ
//      (placeholder varsa yalnız uyarır; --fix-secrets ile değiştirir). Sırları ekrana basmaz.
// [EN] Local setup: creates missing .env files from .env.example and generates JWT_SECRET /
//      MASTER_ENCRYPTION_KEY for backend/.env. Never touches an existing .env (warns on placeholders;
//      --fix-secrets replaces them). Never prints secrets.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PACKAGES = ["contracts", "backend", "frontend"];
// SENKRON TUTUN / KEEP IN SYNC: shannonEntropy ve KNOWN_PLACEHOLDERS backend/scripts/services/siwe.js'ten kopyadır
// (siwe.js yüklenirken JWT_SECRET doğrulayıp throw ettiği için require edilemez). Kurallar: <64 karakter, bilinen
// placeholder içermek ya da entropi < 3.5 => geçersiz. "BURAYA_" yalnız .env.example şablonunu yakalamak içindir.
const KNOWN_PLACEHOLDERS = [
  "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_MIN_64_CHARS",
  "your-secret-here",
  "supersecretkey",
  "changeme",
];

function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const SECRETS = {
  JWT_SECRET: {
    bytes: 64,
    isPlaceholder: (v) => v.length < 64
      || KNOWN_PLACEHOLDERS.some((p) => v.includes(p))
      || v.includes("BURAYA_")
      || shannonEntropy(v) < 3.5,
  },
  MASTER_ENCRYPTION_KEY: { bytes: 32, isPlaceholder: (v) => !/^[0-9a-fA-F]{64}/.test(v) },
};

function secretLineRegex(name) {
  return new RegExp(`^${name}=(.*)$`, "m");
}

function findPlaceholders(content) {
  return Object.keys(SECRETS).filter((name) => {
    const m = content.match(secretLineRegex(name));
    return m ? SECRETS[name].isPlaceholder(m[1].trim()) : false;
  });
}

function fillSecrets(content, names) {
  let out = content;
  for (const name of names) {
    const value = crypto.randomBytes(SECRETS[name].bytes).toString("hex");
    out = out.replace(secretLineRegex(name), () => `${name}=${value}`);
  }
  return out;
}

function initEnv({ root = path.resolve(__dirname, ".."), fixSecrets = false, log = console.log } = {}) {
  const result = { created: [], skipped: [], warned: [], fixed: [] };
  for (const pkg of PACKAGES) {
    const example = path.join(root, pkg, ".env.example");
    const target = path.join(root, pkg, ".env");
    if (!fs.existsSync(example)) continue;
    const rel = `${pkg}/.env`;

    if (!fs.existsSync(target)) {
      let content = fs.readFileSync(example, "utf8");
      if (pkg === "backend") {
        content = fillSecrets(content, findPlaceholders(content));
        // [TR] RELAYER_PRIVATE_KEY gerçek cüzdan anahtarıdır, üretilmez; placeholder ise boş bırakılır (relayer işleri pasif).
        // [EN] A real wallet key, never generated; a placeholder is blanked (relayer jobs stay passive).
        content = content.replace(/^RELAYER_PRIVATE_KEY=.*BURAYA.*$/m, "RELAYER_PRIVATE_KEY=");
      }
      fs.writeFileSync(target, content, { mode: 0o600, flag: "wx" });
      result.created.push(rel);
      log(`[init-env] ${rel} oluşturuldu.`);
      continue;
    }

    result.skipped.push(rel);
    if (pkg !== "backend") {
      log(`[init-env] ${rel} zaten var, dokunulmadı.`);
      continue;
    }
    const existing = fs.readFileSync(target, "utf8");
    const bad = findPlaceholders(existing);
    if (bad.length === 0) {
      log(`[init-env] ${rel} zaten var, dokunulmadı.`);
    } else if (fixSecrets) {
      fs.writeFileSync(target, fillSecrets(existing, bad), { mode: 0o600 });
      result.fixed.push(...bad.map((n) => `${rel}:${n}`));
      log(`[init-env] ${rel}: ${bad.join(", ")} yeniden üretildi (--fix-secrets).`);
    } else {
      result.warned.push(...bad.map((n) => `${rel}:${n}`));
      log(`[init-env] UYARI: ${rel} içinde ${bad.join(", ")} placeholder/geçersiz. Değiştirmek için: node scripts/init-env.js --fix-secrets`);
    }
  }
  return result;
}

module.exports = { initEnv, findPlaceholders, fillSecrets };

if (require.main === module) {
  initEnv({ fixSecrets: process.argv.includes("--fix-secrets") });
}
