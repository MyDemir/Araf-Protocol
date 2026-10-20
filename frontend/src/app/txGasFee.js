// [TR] İşlem öncesi gas/ücret tahmini (bizim RPC) ve native ETH ön kontrolü.
//      Karar mercii kontrattır: tahmindeki revert burada yorumlanmaz, tahmin yoksa eski davranışa dönülür.
// [EN] Pre-send gas/fee estimation (our RPC) and native ETH preflight. The contract stays the authority:
//      estimation reverts are not interpreted here; on any failure we fall back to the old behaviour.

// [TR] Gas tamponu %20 (120/100): tahmin ile gönderim arası durum değişimi (blok, sıra) "gas too low"
//      (-32000) doğurmasın; fazlası iade edilir, yalnız bakiye ön kontrolünü biraz sıkılaştırır.
// [EN] 20% gas buffer: absorbs state drift between estimate and inclusion; unused gas is refunded.
export const GAS_BUFFER_NUMERATOR = 120n;
export const GAS_BUFFER_DENOMINATOR = 100n;

import { estimateContractL1Fee } from 'viem/op-stack';
import { BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID, getSupportedChainsMap } from './chainPolicy';

// [TR] OP Stack (Base, Base Sepolia): işlem ücreti = L2 gas ücreti + L1 veri ücreti. Diğer zincirlerde (hardhat vb.) L1 yok.
// [EN] OP Stack chains add an L1 data fee on top of the L2 execution fee; other chains have none.
const isOpStackChainId = (id) => id === BASE_MAINNET_CHAIN_ID || id === BASE_SEPOLIA_CHAIN_ID;

export const bufferGas = (gas) => (gas * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;

/**
 * [TR] L1 veri ücreti (wei). Yalnız OP Stack zincirlerinde; başarısızlıkta null -> ön kontrol yalnız L2 ücretiyle
 *      yapılır (L2 ücreti gerçek maliyetin alt sınırıdır: yanlış engelleme üretmez, eski davranış).
 * [EN] L1 data fee in wei, OP Stack only; null on failure -> preflight falls back to the L2 fee alone (a lower bound,
 *      so it never blocks wrongly).
 */
export async function estimateL1DataFee({ publicClient, account, address, abi, functionName, args }) {
  if (!publicClient || !isOpStackChainId(publicClient.chain?.id)) return null;
  try {
    const fee = await estimateContractL1Fee(publicClient, { address, abi, functionName, args, account });
    return typeof fee === 'bigint' ? fee : null;
  } catch { return null; }
}

export async function estimateTxParams({ publicClient, account, address, abi, functionName, args }) {
  const out = {};
  if (!publicClient) return out;
  const gasP = (async () => {
    try {
      if (typeof publicClient.estimateContractGas !== 'function') return;
      const gas = await publicClient.estimateContractGas({ address, abi, functionName, args, account });
      if (typeof gas === 'bigint' && gas > 0n) out.gas = bufferGas(gas);
    } catch { /* tahmin yok -> cüzdana bırak */ }
  })();
  const feeP = (async () => {
    try {
      if (typeof publicClient.estimateFeesPerGas !== 'function') return;
      const fees = await publicClient.estimateFeesPerGas();
      if (typeof fees?.maxFeePerGas === 'bigint' && typeof fees?.maxPriorityFeePerGas === 'bigint') {
        out.maxFeePerGas = fees.maxFeePerGas;
        out.maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      }
    } catch { /* ücret yok -> cüzdana bırak */ }
  })();
  await Promise.all([gasP, feeP]);
  return out;
}

/** [TR] Bakiyeyi okur; okunamazsa null (engellemez). [EN] Reads balance; null when unknown. */
export async function readNativeBalance({ publicClient, account }) {
  if (typeof publicClient?.getBalance !== 'function' || !account) return null;
  try {
    const b = await publicClient.getBalance({ address: account });
    return typeof b === 'bigint' ? b : null;
  } catch { return null; }
}

/**
 * [TR] Bakiye tahmini maliyetin (gas × maxFee) altındaysa cüzdan açılmadan anlaşılır hata fırlatır.
 *      Bakiye okunamazsa (null) veya maliyet hesaplanamazsa ENGELLEMEZ.
 * [EN] Throws a readable error when native balance < gas × maxFee. Unknown balance/cost never blocks.
 */
export function assertNativeBalance({ balance, params, l1Fee = null, chainId = null }) {
  if (typeof params?.gas !== 'bigint' || typeof params?.maxFeePerGas !== 'bigint') return;
  if (typeof balance !== 'bigint') return;
  const l1 = typeof l1Fee === 'bigint' ? l1Fee : 0n;
  if (balance >= params.gas * params.maxFeePerGas + l1) return;
  const chain = getSupportedChainsMap(false)[chainId] || 'Ağ';
  const err = new Error(
    `${chain} ETH bakiyen işlem ücretine yetmiyor. Cüzdanına ${chain} ETH ekleyip tekrar dene.`
  );
  err.name = 'InsufficientNativeBalance';
  err.arafPreflight = true;
  throw err;
}

/**
 * [TR] Tüm write yolları için tek giriş: tahmin ve bakiye okuması paralel; sonra ön kontrol.
 * [EN] Single entry for all write paths: estimates and balance read run in parallel, then preflight.
 */
export async function prepareTxParams(ctx) {
  const [params, balance, l1Fee] = await Promise.all([estimateTxParams(ctx), readNativeBalance(ctx), estimateL1DataFee(ctx)]);
  assertNativeBalance({ balance, params, l1Fee, chainId: ctx?.publicClient?.chain?.id });
  return params;
}
