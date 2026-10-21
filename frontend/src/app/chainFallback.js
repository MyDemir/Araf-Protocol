// [TR] Backend'den bağımsız YEDEK işlem görünümü için saf yardımcılar. Backend'in /trades/my listesi alınamadığında
//      kullanıcının bildiği tradeId'ler kontrattan (getTrade) okunur. Frontend karar uydurmaz: durum, roller ve
//      zamanlar yalnız kontrat okumasından gelir; eylem gönderimi yine kontrata gider ve kontrat son söz sahibidir.
// [EN] Pure helpers for the backend-independent chain fallback. Known trade ids are read from the contract; state,
//      roles and timers come only from that read. Actions still go to the contract, which has the final say.
import { mapChainTradeState, isTerminalTradeState, tradeStateRank } from './tradeStateSync';
import { MAX_KNOWN_TRADES } from './knownTrades';

// [TR] Yük sınırları: en fazla 50 id, en fazla 4 eşzamanlı okuma, en sık 30 sn'de bir yenileme.
export const CHAIN_FALLBACK_MAX_READS = MAX_KNOWN_TRADES;
export const CHAIN_FALLBACK_CONCURRENCY = 4;
export const CHAIN_FALLBACK_REFRESH_MS = 30_000;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_DECIMALS = 6;

/** [TR] Yedek görünüm yalnız backend listesi alınamadığında ve cüzdan bağlıyken açılır (lab senaryosunda asla). */
export const shouldUseChainFallback = ({ backendTradesUnavailable = false, isConnected = false, address = null, devScenarioActive = false } = {}) => (
  Boolean(backendTradesUnavailable) && Boolean(isConnected) && Boolean(address) && !devScenarioActive
);

const field = (raw, name, index) => (raw?.[name] !== undefined ? raw[name] : raw?.[index]);
const toLowerAddress = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
const toSeconds = (value) => {
  try {
    const n = Number(BigInt(value ?? 0));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};
const toRawString = (value) => {
  try { return BigInt(value ?? 0).toString(); } catch { return '0'; }
};
const toBps = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * [TR] getTrade okumasını sınıflandırır:
 *   not_found  → kontratta böyle bir işlem yok (maker sıfır adres)
 *   not_party  → bağlı cüzdan ne maker ne taker
 *   terminal   → RESOLVED/CANCELED/BURNED (yapılacak çıkış eylemi yok)
 *   ok         → taraf olunan, terminal olmayan işlem
 */
export const classifyChainTrade = (raw, viewer) => {
  if (!raw) return 'not_found';
  const maker = toLowerAddress(field(raw, 'maker', 2));
  const taker = toLowerAddress(field(raw, 'taker', 3));
  const state = mapChainTradeState(raw);
  if (!maker || maker === ZERO_ADDRESS || !state || state === 'OPEN') return 'not_found';
  const me = toLowerAddress(viewer);
  if (!me || (me !== maker && me !== taker)) return 'not_party';
  if (isTerminalTradeState(state)) return 'terminal';
  return 'ok';
};

/** [TR] Token adresinden sembol (yapılandırılmış adres listesinden); bilinmiyorsa kısa adres. */
export const resolveTokenSymbol = (tokenAddress, supportedTokens = {}) => {
  const target = toLowerAddress(tokenAddress);
  const match = Object.entries(supportedTokens || {}).find(([, addr]) => toLowerAddress(addr) === target && target);
  if (match) return match[0];
  return target ? `${target.slice(0, 6)}…${target.slice(-4)}` : 'TOKEN';
};

/**
 * [TR] Zincir okumasını işlem odasının beklediği activeTrade biçimine çevirir. Backend'e ait alanlar (id, fiat,
 *      kur, ödeme bilgisi, dekont, risk yükü) BİLEREK boştur: yedek oda bunları göstermez.
 */
export const mapChainTradeToRoomTrade = (onchainId, raw, { viewer, supportedTokens = {}, tokenDecimalsMap = {} } = {}) => {
  if (classifyChainTrade(raw, viewer) !== 'ok') return null;
  const maker = field(raw, 'maker', 2);
  const taker = field(raw, 'taker', 3);
  const me = toLowerAddress(viewer);
  const role = me === toLowerAddress(maker) ? 'maker' : 'taker';
  const state = mapChainTradeState(raw);
  const crypto = resolveTokenSymbol(field(raw, 'tokenAddress', 4), supportedTokens);
  const tokenDecimals = Number.isFinite(Number(tokenDecimalsMap?.[crypto])) ? Number(tokenDecimalsMap[crypto]) : DEFAULT_DECIMALS;
  // [TR] Kontratta ping zaman damgası ve "kim pingledi" bayrağı ayrıdır; yalnız bayrak true ise geçerlidir.
  const pingedAt = field(raw, 'pingedByTaker', 19) ? toSeconds(field(raw, 'pingedAt', 18)) : null;
  const challengePingedAt = field(raw, 'challengePingedByMaker', 21) ? toSeconds(field(raw, 'challengePingedAt', 20)) : null;
  const cancelByMaker = Boolean(field(raw, 'cancelProposedByMaker', 16));
  const cancelByTaker = Boolean(field(raw, 'cancelProposedByTaker', 17));
  const myCancel = role === 'maker' ? cancelByMaker : cancelByTaker;
  const otherCancel = role === 'maker' ? cancelByTaker : cancelByMaker;
  const id = String(onchainId);
  return {
    id: null,
    onchainId: id,
    _chainFallback: true,
    role,
    state,
    maker: maker ? `${String(maker).slice(0, 6)}…${String(maker).slice(-4)}` : null,
    makerFull: maker || null,
    takerFull: taker || null,
    crypto,
    cryptoAmountRaw: toRawString(field(raw, 'cryptoAmount', 5)),
    tokenDecimals,
    fiat: null,
    rate: null,
    max: null,
    makerBondRaw: toRawString(field(raw, 'makerBond', 6)),
    takerBondRaw: toRawString(field(raw, 'takerBond', 7)),
    takerFeeBps: toBps(field(raw, 'takerFeeBpsSnapshot', 8)),
    makerFeeBps: toBps(field(raw, 'makerFeeBpsSnapshot', 9)),
    lockedAt: toSeconds(field(raw, 'lockedAt', 13)),
    paidAt: toSeconds(field(raw, 'paidAt', 14)),
    challengedAt: toSeconds(field(raw, 'challengedAt', 15)),
    pingedAt,
    challengePingedAt,
    // [TR] İptal durumu kontrattaki iki bayraktan türetilir (aynadaki cancel_proposal yerine).
    cancelStatus: myCancel ? 'proposed_by_me' : (otherCancel ? 'proposed_by_other' : null),
    chargebackAcked: false,
    paymentIpfsHash: null,
    settlementProposal: null,
  };
};

/**
 * [TR] Okumaları eşzamanlılık sınırıyla çalıştırır (aynı anda en fazla `concurrency`). Sıra korunur; tek okuma
 *      hatası diğerlerini durdurmaz (o id için `null`).
 */
export const runWithConcurrency = async (items, worker, concurrency = CHAIN_FALLBACK_CONCURRENCY) => {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length).fill(null);
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length || 1));
  let next = 0;
  const lane = async () => {
    while (next < list.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await worker(list[index], index);
      } catch {
        results[index] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: limit }, lane));
  return results;
};

/**
 * [TR] Bilinen id'leri okuyup sınıflandırır. `readTrades(ids)` toplu okuyucu (multicall) verilirse tek çağrı
 *      yapılır; yoksa `readTrade(id)` ile sınırlı eşzamanlılıkta tek tek okunur. En fazla CHAIN_FALLBACK_MAX_READS id.
 * @returns {Promise<{ trades: object[], terminalIds: string[], failedIds: string[], states: Record<string,string> }>}
 */
export const loadChainFallbackTrades = async ({
  ids = [],
  viewer,
  readTrade,
  readTrades = null,
  supportedTokens = {},
  tokenDecimalsMap = {},
  concurrency = CHAIN_FALLBACK_CONCURRENCY,
} = {}) => {
  const targets = (Array.isArray(ids) ? ids : []).slice(0, CHAIN_FALLBACK_MAX_READS);
  let raws = null;
  if (typeof readTrades === 'function' && targets.length) {
    try { raws = await readTrades(targets); } catch { raws = null; }
  }
  if (!Array.isArray(raws) || raws.length !== targets.length) {
    raws = typeof readTrade === 'function'
      ? await runWithConcurrency(targets, (id) => readTrade(id), concurrency)
      : targets.map(() => null);
  }
  const trades = [];
  const terminalIds = [];
  const failedIds = [];
  const states = {};
  targets.forEach((id, i) => {
    const raw = raws[i];
    if (!raw) { failedIds.push(id); return; }
    const chainState = mapChainTradeState(raw);
    if (chainState) states[id] = chainState;
    const kind = classifyChainTrade(raw, viewer);
    if (kind === 'terminal') terminalIds.push(id);
    if (kind !== 'ok') return;
    const mapped = mapChainTradeToRoomTrade(id, raw, { viewer, supportedTokens, tokenDecimalsMap });
    if (mapped) trades.push(mapped);
  });
  return { trades, terminalIds, failedIds, states };
};

/** [TR] Yenileme kısıtı: sekme gizliyse ya da son okumadan bu yana 30 sn geçmediyse liste yeniden okunmaz. */
export const canRefreshChainFallback = ({ lastAt = 0, now = Date.now(), hidden = false, minIntervalMs = CHAIN_FALLBACK_REFRESH_MS } = {}) => {
  if (hidden) return false;
  if (!lastAt) return true;
  return now - lastAt >= minIntervalMs;
};

const TIMESTAMP_KEYS = new Set(['lockedAt', 'paidAt', 'challengedAt', 'pingedAt', 'challengePingedAt']);

/**
 * [TR] Açık yedek odayı yeni zincir okumasıyla birleştirir. Kurallar: durum asla geri gitmez (tx sonrası RPC bir
 *      blok geride kalabilir); dolu bir zaman damgası gecikmeli okumadaki boş değerle silinmez; terminal duruma
 *      geçen işlem (listede artık yok) yalnız durumuyla güncellenir. Değişiklik yoksa aynı nesne döner.
 */
export const mergeChainTradeIntoRoom = (current, fresh, chainState = null) => {
  if (!current) return current;
  const currentRank = tradeStateRank(current.state);
  if (fresh) {
    if (tradeStateRank(fresh.state) < currentRank) return current;
    // eslint-disable-next-line no-unused-vars
    const { role, cancelStatus, ...fields } = fresh;
    let changed = false;
    const next = { ...current };
    // [TR] İptal teklifi/geri çekme tek başına değişebilir (durum/zaman damgası aynı kalır); karşılaştırmaya dahil.
    // [EN] A cancel proposal/revoke can change alone; include it in the comparison.
    if ((current.cancelStatus ?? null) !== (cancelStatus ?? null)) {
      next.cancelStatus = cancelStatus ?? null;
      changed = true;
    }
    for (const [key, value] of Object.entries(fields)) {
      if (TIMESTAMP_KEYS.has(key) && (value === null || value === undefined) && current[key]) continue;
      if (next[key] !== value) {
        next[key] = value;
        changed = true;
      }
    }
    // [TR] F2-04: taze (stale olmayan) okuma odadaki `stale` işaretini kaldırır; yoksa oda kalıcı kilitli kalır.
    // [EN] F2-04: a fresh (non-stale) read clears the room's `stale` flag, otherwise the room stays locked.
    if (fresh.stale !== true && 'stale' in next) {
      delete next.stale;
      changed = true;
    }
    return changed ? next : current;
  }
  if (chainState && isTerminalTradeState(chainState) && current.state !== chainState && tradeStateRank(chainState) >= currentRank) {
    return { ...current, state: chainState };
  }
  return current;
};

/**
 * [TR] Açık yedek oda hâlâ bağlı cüzdana mı ait? Cüzdan değişince (backend yokken oturum temizliği çalışmaz)
 *      görüntüleyen maker/taker değilse ya da rolü değiştiyse oda KAPATILMALIDIR; rol sessizce yeniden
 *      hesaplanmaz, kullanıcı listeden yeniden açar.
 */
export const isChainFallbackRoomOwnedBy = (trade, viewer, role) => {
  const me = toLowerAddress(viewer);
  if (!me) return false;
  const maker = toLowerAddress(trade?.makerFull);
  const taker = toLowerAddress(trade?.takerFull);
  const expectedRole = me === maker ? 'maker' : (me === taker ? 'taker' : null);
  return Boolean(expectedRole) && expectedRole === role;
};
