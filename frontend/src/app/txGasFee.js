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

/**
 * [TR] Gas ve EIP-1559 ücretlerini bizim publicClient'tan hesaplar. Herhangi bir adım başarısız olursa
 *      ilgili alan verilmez (sessiz geri düşüş: cüzdan kendi tahminini yapar). Asla throw etmez.
 * [EN] Returns { gas, maxFeePerGas, maxPriorityFeePerGas } (fields omitted when unavailable). Never throws.
 */
export async function estimateTxParams({ publicClient, account, address, abi, functionName, args }) {
  const out = {};
  if (!publicClient) return out;
  try {
    if (typeof publicClient.estimateContractGas === 'function') {
      const gas = await publicClient.estimateContractGas({ address, abi, functionName, args, account });
      if (typeof gas === 'bigint' && gas > 0n) out.gas = bufferGas(gas);
    }
  } catch { /* tahmin yok -> cüzdana bırak */ }
  try {
    if (typeof publicClient.estimateFeesPerGas === 'function') {
      const fees = await publicClient.estimateFeesPerGas();
      if (typeof fees?.maxFeePerGas === 'bigint' && typeof fees?.maxPriorityFeePerGas === 'bigint') {
        out.maxFeePerGas = fees.maxFeePerGas;
        out.maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
      }
    }
  } catch { /* ücret yok -> cüzdana bırak */ }
  return out;
}

/**
 * [TR] Bakiye tahmini maliyetin (gas × maxFee) altındaysa cüzdan açılmadan anlaşılır hata fırlatır.
 *      Bakiye okunamazsa veya maliyet hesaplanamazsa ENGELLEMEZ.
 * [EN] Throws a readable error when native balance < gas × maxFee. Unknown balance/cost never blocks.
 */
export async function assertNativeBalance({ publicClient, account, params, faucetUrl }) {
  if (typeof params?.gas !== 'bigint' || typeof params?.maxFeePerGas !== 'bigint') return;
  if (typeof publicClient?.getBalance !== 'function' || !account) return;
  let balance;
  try { balance = await publicClient.getBalance({ address: account }); } catch { return; }
  if (typeof balance !== 'bigint') return;
  if (balance >= params.gas * params.maxFeePerGas) return;
  const err = new Error(
    'Base Sepolia ETH bakiyen işlem ücretine yetmiyor. Cüzdanına Base Sepolia ETH ekleyip tekrar dene.'
    + (faucetUrl ? ` Faucet: ${faucetUrl}` : '')
  );
  err.name = 'InsufficientNativeBalance';
  err.arafPreflight = true;
  throw err;
}

/**
 * [TR] Tüm write yolları için tek giriş: tahmin + bakiye ön kontrolü; dönen alanlar writeContract'a yayılır.
 * [EN] Single entry for all write paths: estimate + balance preflight; spread result into writeContract.
 */
export async function prepareTxParams(ctx) {
  const params = await estimateTxParams(ctx);
  await assertNativeBalance({ ...ctx, params });
  return params;
}
