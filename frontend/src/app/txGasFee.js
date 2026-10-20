// [TR] İşlem öncesi gas/ücret tahmini (bizim RPC) ve native ETH ön kontrolü.
//      Karar mercii kontrattır: tahmindeki revert burada yorumlanmaz, tahmin yoksa eski davranışa dönülür.
// [EN] Pre-send gas/fee estimation (our RPC) and native ETH preflight. The contract stays the authority:
//      estimation reverts are not interpreted here; on any failure we fall back to the old behaviour.

// [TR] Gas tamponu %20 (120/100): tahmin ile gönderim arası durum değişimi (blok, sıra) "gas too low"
//      (-32000) doğurmasın; fazlası iade edilir, yalnız bakiye ön kontrolünü biraz sıkılaştırır.
// [EN] 20% gas buffer: absorbs state drift between estimate and inclusion; unused gas is refunded.
export const GAS_BUFFER_NUMERATOR = 120n;
export const GAS_BUFFER_DENOMINATOR = 100n;

export const bufferGas = (gas) => (gas * GAS_BUFFER_NUMERATOR) / GAS_BUFFER_DENOMINATOR;

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
export function assertNativeBalance({ balance, params }) {
  if (typeof params?.gas !== 'bigint' || typeof params?.maxFeePerGas !== 'bigint') return;
  if (typeof balance !== 'bigint') return;
  if (balance >= params.gas * params.maxFeePerGas) return;
  const err = new Error(
    'Base Sepolia ETH bakiyen işlem ücretine yetmiyor. Cüzdanına Base Sepolia ETH ekleyip tekrar dene.'
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
  const [params, balance] = await Promise.all([estimateTxParams(ctx), readNativeBalance(ctx)]);
  assertNativeBalance({ balance, params });
  return params;
}
