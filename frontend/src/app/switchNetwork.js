// [TR] Tek dokunuşla desteklenen ağa geçiş yardımcıları. Desteklenen zincir listesi chainPolicy'den gelir.
// [EN] One-tap switch helpers. The supported chain list comes from chainPolicy.
import {
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  TARGET_CHAIN_BASE_SEPOLIA,
  getSupportedChainsMap,
  resolveTargetChain,
} from './chainPolicy';

// [TR] Yalnız bu iki zincir için sabit ekleme bilgisi (cüzdan ağı tanımıyorsa wagmi 4902'de kullanır).
// [EN] Fixed add-chain params for these two chains only (wagmi uses them on a 4902 "unknown chain").
const ADD_CHAIN_PARAMS = {
  [BASE_SEPOLIA_CHAIN_ID]: {
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
  [BASE_MAINNET_CHAIN_ID]: {
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
};

// [TR] Varsayılan beklenen zincir: base-sepolia hedefi → 84532; prod 'base' → 8453; dev → Base Sepolia.
export const getExpectedChain = (
  isProd = import.meta.env.PROD,
  targetChain = import.meta.env.VITE_TARGET_CHAIN,
) => {
  const map = getSupportedChainsMap(isProd, targetChain);
  const ids = Object.keys(map).map(Number);
  let id = BASE_SEPOLIA_CHAIN_ID;
  if (isProd) id = resolveTargetChain(targetChain) === TARGET_CHAIN_BASE_SEPOLIA ? BASE_SEPOLIA_CHAIN_ID : BASE_MAINNET_CHAIN_ID;
  if (!ids.includes(id)) id = ids[0];
  return { chainId: id, name: map[id] };
};

// [TR] Ek: "Sepolia'ya", "Mainnet'e".
export const switchChainLabel = (lang, name) => {
  if (lang !== 'TR') return `Switch to ${name}`;
  const suffix = /a$/i.test(name) ? "'ya" : "'e";
  return `${name}${suffix} geç`;
};

export const signInWrongNetworkMessage = (lang, name = getExpectedChain().name) => (lang === 'TR'
  ? `Önce ${name} ağına geçin, sonra giriş yapın.`
  : `Switch to ${name} first, then sign in.`);

const errText = (e) => `${e?.shortMessage || ''} ${e?.message || ''}`.toLowerCase();

export const isUserRejection = (e) => {
  const code = e?.code ?? e?.cause?.code;
  return code === 4001 || e?.name === 'UserRejectedRequestError' || e?.cause?.name === 'UserRejectedRequestError'
    || /user rejected|user denied|rejected the request/.test(errText(e));
};

export const switchToExpectedChain = async ({ switchChainAsync, lang = 'EN', showToast }) => {
  const { chainId, name } = getExpectedChain();
  try {
    await switchChainAsync({
      chainId,
      ...(ADD_CHAIN_PARAMS[chainId] ? { addEthereumChainParameter: ADD_CHAIN_PARAMS[chainId] } : {}),
    });
    return true;
  } catch (error) {
    if (isUserRejection(error)) {
      showToast(lang === 'TR' ? 'Ağ değiştirme iptal edildi.' : 'Network switch cancelled.', 'info');
    } else {
      // [TR] Desteklenmeyen yöntem ve diğer hatalar: elle değiştirme yönlendirmesi.
      showToast(lang === 'TR'
        ? `Cüzdanınız ağ değiştirmeyi desteklemiyor. Cüzdanın ağ seçicisinden bu site için ${name} ağını seçin.`
        : `Your wallet does not support switching networks. Pick ${name} from the wallet's network selector for this site.`, 'info');
    }
    return false;
  }
};
