import { formatUnits } from 'viem';

/**
 * [TR] Approve'dan ÖNCE cüzdan bakiyesini kontrol eder. Bakiye bilinmiyorsa (okunamadı / fonksiyon yok) engellemez;
 *      kontrat son söz sahibidir. Yetersizse net hata metni döndürür, yeterliyse null.
 * [EN] Pre-approve balance check. Unknown balance never blocks. Returns an error message when insufficient, else null.
 */
export const checkTokenBalance = async ({
  getTokenBalance, getTokenDecimals, tokenAddress, owner, required, symbol, lang = 'EN', detailTr, detailEn,
}) => {
  if (typeof getTokenBalance !== 'function') return null;
  let balance;
  try { balance = await getTokenBalance(tokenAddress, owner); } catch (_) { balance = null; }
  if (balance === null || balance === undefined) return null;
  const need = BigInt(required);
  const have = BigInt(balance);
  if (have >= need) return null;
  let requiredUi = need.toString();
  let balanceUi = have.toString();
  try {
    const decimals = Number(await getTokenDecimals(tokenAddress));
    requiredUi = formatUnits(need, decimals);
    balanceUi = formatUnits(have, decimals);
  } catch (_) { /* ham birim gösterilir */ }
  return lang === 'TR'
    ? `Yetersiz ${symbol} bakiyesi. Gereken: ${requiredUi} ${symbol} (${detailTr}), cüzdanınızda: ${balanceUi} ${symbol}.`
    : `Insufficient ${symbol} balance. Required: ${requiredUi} ${symbol} (${detailEn}), in wallet: ${balanceUi} ${symbol}.`;
};
