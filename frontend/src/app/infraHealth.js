// [TR] Altyapı sağlığı (backend / RPC) için küçük, bağımsız bir depo. Açılış istekleri başarısız olunca işaretler;
//      tek bir arka plan yoklaması (üstel geri çekilme + jitter) altyapı dönünce işareti kaldırır ve "epoch"
//      sayacını artırır; böylece veri çeken efektler sayfa yenilenmeden yeniden çalışır. Tek yoklama = istek seli yok.
// [EN] Tiny standalone store for backend / RPC health. Boot requests mark failures; ONE background probe
//      (exponential backoff + jitter) clears the flag on recovery and bumps `epoch` so data effects re-run without
//      a page reload. A single probe per kind means no request flood.
import { useSyncExternalStore } from 'react';

export const INFRA_BACKOFF_BASE_MS = 5000;
export const INFRA_BACKOFF_MAX_MS = 60000;

let state = { backend: false, rpc: false, epoch: 0 };
const listeners = new Set();
const probes = {};
const timers = {};
const attempts = { backend: 0, rpc: 0 };
// [TR] Histerezis: sıradan (başka uç noktalara giden) başarılı çağrılar bayrağı KALDIRMAZ; yalnız yoklama başarısı kaldırır.
//      Aksi halde bir uç nokta bozukken diğerlerinin başarısı bayrağı sürekli açıp kapatır (titreme + istek seli).
//      Toparlanmadan hemen sonra yeniden arıza gelirse geri çekilme sıfırlanmaz.
const RECENT_RECOVERY_MS = 30000;
const lastRecoveryAt = { backend: 0, rpc: 0 };

const emit = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const nextBackoffMs = (attempt, random = Math.random) => {
  const base = Math.min(INFRA_BACKOFF_MAX_MS, INFRA_BACKOFF_BASE_MS * (2 ** attempt));
  return Math.round(base * (0.8 + random() * 0.4));
};

const clearTimer = (kind) => {
  if (timers[kind]) { clearTimeout(timers[kind]); timers[kind] = null; }
};

export const markInfraOk = (kind) => {
  if (!state[kind]) return;
  clearTimer(kind);
  lastRecoveryAt[kind] = Date.now();
  emit({ [kind]: false, epoch: state.epoch + 1 });
};

const schedule = (kind) => {
  if (timers[kind] || !probes[kind] || !state[kind]) return;
  timers[kind] = setTimeout(async () => {
    timers[kind] = null;
    if (!state[kind]) return;
    // [TR] Sekme gizliyken yoklama atlanır (gereksiz istek yok). [EN] Skip while the tab is hidden.
    if (typeof document !== 'undefined' && document.hidden) { schedule(kind); return; }
    attempts[kind] += 1;
    let ok;
    try { ok = Boolean(await probes[kind]()); } catch { ok = false; }
    if (ok) markInfraOk(kind);
    else schedule(kind);
  }, nextBackoffMs(attempts[kind]));
};

export const markInfraFailure = (kind) => {
  if (state[kind]) return;
  if (Date.now() - lastRecoveryAt[kind] > RECENT_RECOVERY_MS) attempts[kind] = 0;
  emit({ [kind]: true });
  schedule(kind);
};

// [TR] Yoklama kaydı: true dönerse altyapı geri gelmiştir. Kayıt silme fonksiyonu döner.
export const registerInfraProbe = (kind, fn) => {
  probes[kind] = fn;
  schedule(kind);
  return () => { if (probes[kind] === fn) { delete probes[kind]; clearTimer(kind); } };
};

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getState = () => state;

export const useInfraHealth = () => useSyncExternalStore(subscribe, getState, getState);
export const getInfraHealth = getState;

export const __resetInfraForTest = () => {
  Object.keys(timers).forEach(clearTimer);
  Object.keys(probes).forEach((k) => delete probes[k]);
  attempts.backend = 0;
  attempts.rpc = 0;
  lastRecoveryAt.backend = 0;
  lastRecoveryAt.rpc = 0;
  state = { backend: false, rpc: false, epoch: 0 };
  listeners.forEach((l) => l());
};
