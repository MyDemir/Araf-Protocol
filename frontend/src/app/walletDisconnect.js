// [TR] Cüzdan eklentisinin arka plan bağlantısı koptuğunda (OKX vb.) sayfa yenilemeden düzelmez.
// [EN] When a wallet extension loses its background connection, only a page reload recovers it.
// [TR] F2-17: düz "connection closed" RPC/WS gibi ilgisiz hataları da yakalıyordu. Yalnız cüzdan eklentisi ifadeleri ve
//      WalletConnect'in gerçek WS kopma mesajı ("WebSocket connection closed abnormally with code: ...",
//      @walletconnect/jsonrpc-provider onClose) eşleşir.
// [EN] F2-17: plain "connection closed" matched unrelated RPC/WS errors; only wallet-specific phrasings remain.
const DISCONNECT_PATTERN = /page reload required|disconnected from .{0,60}background|extension context invalidated|websocket connection closed abnormally|walletconnect.{0,80}connection closed|connection closed.{0,80}walletconnect/i;

export const WALLET_DISCONNECTED_KEY = 'wallet-provider-disconnected';

export const isWalletProviderDisconnectedError = (err, depth = 0, seen = new Set()) => {
  if (err == null || depth > 5) return false;
  if (typeof err === 'string') return DISCONNECT_PATTERN.test(err);
  if (typeof err !== 'object' || seen.has(err)) return false;
  seen.add(err);
  if (typeof err.message === 'string' && DISCONNECT_PATTERN.test(err.message)) return true;
  if (typeof err.shortMessage === 'string' && DISCONNECT_PATTERN.test(err.shortMessage)) return true;
  return isWalletProviderDisconnectedError(err.cause, depth + 1, seen)
    || isWalletProviderDisconnectedError(err.error, depth + 1, seen)
    || isWalletProviderDisconnectedError(err.reason, depth + 1, seen);
};

export const walletDisconnectedMessage = (lang = 'TR') => (lang === 'TR'
  ? 'Cüzdan eklentisinin bağlantısı koptu. Devam etmek için sayfayı yenileyin.'
  : 'Your wallet extension lost its connection. Reload the page to continue.');

export const walletReloadLabel = (lang = 'TR') => (lang === 'TR' ? 'Sayfayı yenile' : 'Reload page');

// [TR] Otomatik yenileme yok; kullanıcı butona basınca yenilenir.
export const reloadPage = () => window.location.reload();

export const walletDisconnectedToast = (lang = 'TR') => ({
  message: walletDisconnectedMessage(lang),
  type: 'error',
  options: { key: WALLET_DISCONNECTED_KEY, action: { label: walletReloadLabel(lang), onClick: reloadPage } },
});
