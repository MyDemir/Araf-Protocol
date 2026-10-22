import { describeContractErrorName, extractContractErrorName } from './contractErrors';
import { APP_LANG_STORAGE_KEY } from './bootstrapState';

/**
 * [TR] Cüzdanın çözülemeyen yazma hatalarını, bizim RPC'mizde tek bir simulateContract ile teşhis eder.
 *      Yalnız teşhis içindir: hiçbir işlemi engellemez ya da göndermez; kontrat son söz sahibidir.
 * [EN] Diagnoses undecoded wallet write errors with a single simulateContract on our own RPC.
 *      Diagnosis only: never blocks or sends a transaction.
 */

export const SIMULATION_TIMEOUT_MS = 8000;

const PUBLIC_RPC_BY_CHAIN = {
  84532: { name: 'Base Sepolia', url: 'https://sepolia.base.org' },
  8453: { name: 'Base', url: 'https://mainnet.base.org' },
};

const readLang = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(APP_LANG_STORAGE_KEY) === 'TR' ? 'TR' : 'EN';
  } catch {
    return 'EN';
  }
};

export const buildWalletRpcMessage = (chainId, lang = readLang()) => {
  const row = PUBLIC_RPC_BY_CHAIN[Number(chainId)];
  if (!row) {
    return lang === 'TR'
      ? 'İşlem kontrat tarafında geçerli görünüyor; hata cüzdanınızın ağ bağlantısından (RPC) geliyor. Cüzdanınızın RPC ayarını kontrol edin.'
      : "The transaction looks valid on-chain; the error comes from your wallet's network connection (RPC). Check your wallet's RPC settings.";
  }
  return lang === 'TR'
    ? `İşlem kontrat tarafında geçerli görünüyor; hata cüzdanınızın ağ bağlantısından (RPC) geliyor. Cüzdanınızın ağ ayarlarında ${row.name} için RPC adresini ${row.url} olarak değiştirip tekrar deneyin.`
    : `The transaction looks valid on-chain; the error comes from your wallet's network connection (RPC). Change the ${row.name} RPC in your wallet's network settings to ${row.url} and try again.`;
};

export const buildInsufficientGasMessage = (chainId, lang = readLang()) => {
  const name = PUBLIC_RPC_BY_CHAIN[Number(chainId)]?.name;
  const eth = name ? `${name} ETH` : 'ETH';
  return lang === 'TR'
    ? `Cüzdanınızda işlem ücreti (gas) için yeterli ETH yok. ${eth} ekleyip tekrar deneyin.`
    : `Your wallet does not have enough ETH for the network fee (gas). Add ${eth} and try again.`;
};

const causeChain = (error) => {
  const out = [];
  let cur = error;
  for (let i = 0; cur && typeof cur === 'object' && i < 8; i += 1) {
    out.push(cur);
    cur = cur.cause;
  }
  return out;
};

export const isUserRejection = (error) =>
  causeChain(error).some((e) =>
    e.code === 4001 || e.code === 'ACTION_REJECTED' ||
    /UserRejected/i.test(String(e.name || '')) ||
    /user rejected|user denied|rejected the request/i.test(`${e.shortMessage || ''} ${e.message || ''}`));

export const isInsufficientFunds = (error) =>
  causeChain(error).some((e) =>
    /InsufficientFunds/i.test(String(e.name || '')) ||
    /insufficient funds/i.test(`${e.shortMessage || ''} ${e.message || ''}`));

export const isGasIncludedUnsupported = (error) =>
  causeChain(error).some((e) =>
    /gas station|gas included|EIP-?7702/i.test(`${e.shortMessage || ''} ${e.message || ''} ${e.details || ''}`));

export const isRpcLimit = (error, rpcCode) =>
  rpcCode === -32005 ||
  causeChain(error).some((e) =>
    /exceeds defined limit|rate limit/i.test(`${e.shortMessage || ''} ${e.message || ''} ${e.details || ''}`));

export const buildGasIncludedMessage = (chainId, lang = readLang()) => {
  const name = PUBLIC_RPC_BY_CHAIN[Number(chainId)]?.name;
  const eth = name ? `${name} ETH` : 'ETH';
  return lang === 'TR'
    ? `Cüzdanınız işlem ücretini token ile ödemeyi (gas station) denedi; bu ağda desteklenmiyor. Cüzdanınıza ${eth} ekleyip tekrar deneyin.`
    : `Your wallet tried to pay the network fee with a token (gas station); this network does not support it. Add ${eth} to your wallet and try again.`;
};

export const isWalletRequestPending = (error, rpcCode) =>
  rpcCode === -32002 ||
  causeChain(error).some((e) => /already pending|request already|resource unavailable/i.test(`${e.shortMessage || ''} ${e.message || ''} ${e.details || ''}`));

export const buildWalletPendingMessage = (lang = readLang()) => (lang === 'TR'
  ? 'Cüzdanınızda bekleyen bir istek var. Cüzdanı açıp önce onu onaylayın ya da reddedin, sonra tekrar deneyin.'
  : 'Your wallet already has a pending request. Open the wallet, approve or reject it first, then try again.');

export const extractRpcCode = (error) => {
  for (const e of causeChain(error)) {
    if (typeof e.code === 'number' && e.code !== 4001) return e.code;
  }
  const raw = causeChain(error).map((e) => `${e.shortMessage || ''} ${e.message || ''}`).join(' ');
  const m = raw.match(/"code"\s*:\s*(-?\d+)/);
  return m ? Number(m[1]) : null;
};

export const extractSelector = (error) => {
  for (const e of causeChain(error)) {
    const cands = [e.signature, e.data?.signature, typeof e.data === 'string' ? e.data : null, e.raw];
    for (const c of cands) {
      if (typeof c === 'string' && /^0x[0-9a-fA-F]{8}/.test(c)) return c.slice(0, 10).toLowerCase();
    }
  }
  return null;
};

const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('simulation-timeout')), ms);
  promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/**
 * @returns {Promise<{kind:string, message:string|null, errorName:string|null, selector:string|null, rpcCode:number|null}>}
 */
export async function diagnoseWriteError({
  error, publicClient, account, address, abi, functionName, args, chainId,
  lang = readLang(), timeoutMs = SIMULATION_TIMEOUT_MS,
}) {
  const base = { kind: 'unknown', message: null, errorName: null, selector: extractSelector(error), rpcCode: extractRpcCode(error) };
  if (!error || isUserRejection(error)) return base;
  const resolved = extractContractErrorName(error);
  if (resolved) return { ...base, kind: `contract-revert:${resolved}`, errorName: resolved };
  if (isInsufficientFunds(error)) {
    return { ...base, kind: 'wallet-insufficient-gas', message: buildInsufficientGasMessage(chainId, lang) };
  }
  if (isGasIncludedUnsupported(error)) {
    return { ...base, kind: 'wallet-gas-included', message: buildGasIncludedMessage(chainId, lang) };
  }
  if (isRpcLimit(error, base.rpcCode)) {
    return { ...base, kind: 'wallet-rpc-limit', message: buildWalletRpcMessage(chainId, lang) };
  }
  // [TR] F2-10: -32002 = cüzdanda zaten bekleyen istek var; RPC sorunu değil. Simülasyondan önce ayrı sınıf.
  if (isWalletRequestPending(error, base.rpcCode)) {
    return { ...base, kind: 'wallet-request-pending', message: buildWalletPendingMessage(lang) };
  }
  if (!publicClient?.simulateContract || !account) return base;

  try {
    await withTimeout(publicClient.simulateContract({ account, address, abi, functionName, args }), timeoutMs);
  } catch (simError) {
    const name = extractContractErrorName(simError);
    if (!name) return base; // ağ hatası / zaman aşımı / çözülemeyen revert: mevcut davranış
    return {
      ...base,
      kind: `contract-revert:${name}`,
      errorName: name,
      selector: base.selector || extractSelector(simError),
      message: describeContractErrorName(name, lang),
    };
  }
  return { ...base, kind: 'wallet-rpc', message: buildWalletRpcMessage(chainId, lang) };
}

/** [TR] Teşhisi hataya işler (shortMessage + arafDiagnosis). [EN] Applies diagnosis onto the error. */
export function applyDiagnosis(error, diag) {
  if (!error || typeof error !== 'object') return error;
  try {
    error.arafDiagnosis = diag.kind;
    if (diag.errorName) error.arafErrorName = diag.errorName;
    if (diag.message) error.shortMessage = diag.message;
  } catch {
    // frozen error — leave untouched
  }
  return error;
}

export const stripAddresses = (text) => String(text).replace(/0x[0-9a-fA-F]{40}/g, '[addr]');
