// [TR] Bilinen işlem numaraları (tradeId) kaydı: backend'in /trades/my listesi alınamadığında zincirden okunacak
//      işlemlerin tek kaynağıdır. Anahtar cüzdan + escrow + zincir üçlüsüdür (başka cüzdanın/kontratın listesi
//      karışmaz). Yalnız pozitif tam sayı dizgileri saklanır (PII yok), en yeni başta, en fazla MAX_KNOWN_TRADES.
//      Depolama yoksa ya da hata verirse sessizce hiçbir şey yapılmaz (uygulama akışı bozulmaz).
// [EN] Registry of known trade ids used by the chain fallback when the backend list is unavailable. Keyed by
//      wallet + escrow + chain; stores only positive integer strings (no PII), newest first, capped. Fails silent.

export const KNOWN_TRADES_STORAGE_PREFIX = 'araf_known_trades:v1';
export const MAX_KNOWN_TRADES = 50;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
// uint256 en fazla 78 basamaktır; baştaki sıfırlar normalize edilir.
const TRADE_ID_RE = /^[0-9]{1,78}$/;

/** [TR] Pozitif tam sayı tradeId'yi kanonik dizgeye çevirir; geçersizse null. */
export const normalizeKnownTradeId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  const raw = typeof value === 'bigint' ? value.toString() : String(value).trim().replace(/^#/, '');
  if (!TRADE_ID_RE.test(raw)) return null;
  try {
    const n = BigInt(raw);
    if (n <= 0n || n >= 2n ** 256n) return null;
    return n.toString();
  } catch {
    return null;
  }
};

/** [TR] Anahtar: önek:zincir:escrow:cüzdan (küçük harf). Eksik/geçersiz parça varsa null (kayıt yapılmaz). */
export const knownTradesStorageKey = ({ wallet, escrow, chainId } = {}) => {
  const chain = Number(chainId);
  if (!Number.isSafeInteger(chain) || chain <= 0) return null;
  if (!ADDRESS_RE.test(String(wallet || '')) || !ADDRESS_RE.test(String(escrow || ''))) return null;
  return `${KNOWN_TRADES_STORAGE_PREFIX}:${chain}:${String(escrow).toLowerCase()}:${String(wallet).toLowerCase()}`;
};

const resolveStorage = (storage) => {
  if (storage !== undefined) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** [TR] Kayıtlı listeyi okur (en yeni başta). Depolama yok/bozuk → []. */
export const readKnownTradeIds = (scope, storage) => {
  const key = knownTradesStorageKey(scope);
  const store = resolveStorage(storage);
  if (!key || !store) return [];
  try {
    const parsed = JSON.parse(store.getItem(key) || '[]');
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (const item of parsed) {
      const id = normalizeKnownTradeId(item);
      if (id && !out.includes(id)) out.push(id);
      if (out.length >= MAX_KNOWN_TRADES) break;
    }
    return out;
  } catch {
    return [];
  }
};

const writeIds = (key, store, current, next) => {
  // Değişiklik yoksa yazılmaz (gereksiz depolama yazımı yok).
  if (next.length === current.length && next.every((id, i) => id === current[i])) return current;
  try {
    store.setItem(key, JSON.stringify(next));
    return next;
  } catch {
    return current;
  }
};

/**
 * [TR] Yeni id'leri listenin başına ekler; zaten kayıtlı id tekrar eklenmez (yeri değişmez). Sınır aşılırsa
 *      en eskiler düşer.
 * @returns {string[]} yeni liste (depolama yoksa [])
 */
export const addKnownTradeIds = (scope, ids, storage) => {
  const key = knownTradesStorageKey(scope);
  const store = resolveStorage(storage);
  if (!key || !store) return [];
  const incoming = [];
  for (const value of Array.isArray(ids) ? ids : [ids]) {
    const id = normalizeKnownTradeId(value);
    if (id && !incoming.includes(id)) incoming.push(id);
  }
  const current = readKnownTradeIds(scope, store);
  const fresh = incoming.filter((id) => !current.includes(id));
  if (!fresh.length) return current;
  return writeIds(key, store, current, [...fresh, ...current].slice(0, MAX_KNOWN_TRADES));
};

/** [TR] Kapanmış (terminal) işlemleri listeden çıkarır: sonraki yedek okumalar gereksiz RPC çağrısı yapmaz. */
export const removeKnownTradeIds = (scope, ids, storage) => {
  const key = knownTradesStorageKey(scope);
  const store = resolveStorage(storage);
  if (!key || !store) return [];
  const drop = new Set((Array.isArray(ids) ? ids : [ids]).map(normalizeKnownTradeId).filter(Boolean));
  const current = readKnownTradeIds(scope, store);
  if (!drop.size) return current;
  return writeIds(key, store, current, current.filter((id) => !drop.has(id)));
};
