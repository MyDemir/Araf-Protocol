// [TR] Cüzdan modalı için bağlayıcıları 3 seçeneğe böler: 1) bu tarayıcıdaki cüzdan(lar), 2) WalletConnect, 3) Coinbase.
//      EIP-6963 ile keşfedilen cüzdanlar ile genel "Injected" tekilleştirilir (aynı cüzdan iki kez görünmez).
// [EN] Splits connectors into the 3 wallet options: 1) wallet(s) in this browser, 2) WalletConnect, 3) Coinbase.
//      EIP-6963-discovered wallets and the generic "Injected" are de-duplicated (same wallet never listed twice).

const isWalletConnect = (c) => c?.id === 'walletConnect' || c?.type === 'walletConnect';
const isCoinbase = (c) => c?.id === 'coinbaseWalletSDK' || c?.type === 'coinbaseWallet' || /coinbase/i.test(String(c?.id || ''));
const isGenericInjected = (c) => c?.id === 'injected';

export const groupWalletConnectors = (connectors = [], win = typeof window !== 'undefined' ? window : null) => {
  const walletConnect = connectors.find(isWalletConnect) || null;
  const coinbase = connectors.find((c) => !isWalletConnect(c) && c?.id === 'coinbaseWalletSDK')
    || connectors.find((c) => !isWalletConnect(c) && isCoinbase(c)) || null;
  const seen = new Set();
  const named = [];
  for (const c of connectors) {
    if (isWalletConnect(c) || isCoinbase(c) || isGenericInjected(c)) continue;
    const nameKey = String(c.name || '').trim().toLowerCase();
    const idKey = String(c.id || '').trim().toLowerCase();
    if (!nameKey && !idKey) continue;
    if ((nameKey && seen.has(nameKey)) || (idKey && seen.has(idKey))) continue;
    if (nameKey) seen.add(nameKey);
    if (idKey) seen.add(idKey);
    named.push(c);
  }
  const hasEthereum = Boolean(win && win.ethereum);
  const generic = connectors.find(isGenericInjected) || null;
  // [TR] Adlandırılmış (EIP-6963) cüzdan varsa genel Injected gizlenir; yoksa ve window.ethereum varsa o gösterilir.
  const browser = named.length > 0 ? named : (generic && hasEthereum ? [generic] : []);
  return { browser, walletConnect, coinbase, hasEthereum };
};
