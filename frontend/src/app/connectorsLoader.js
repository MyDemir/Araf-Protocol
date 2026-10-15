import { isValidWalletConnectProjectId, makeLazyConnector } from './walletConnectConfig';

// [TR] Bağlayıcı chunk'ı yüklenemezse (ağ hatası, eski deploy) sessiz boş ekran yerine kademeli geri düşüş:
//      1) tüm bağlayıcılar, 2) yalnız injected() (yeniden deneme), 3) bağlayıcısız (EIP-6963 keşfi yine çalışır).
// [EN] If the connectors chunk fails to load (network error, stale deploy), degrade in steps instead of a blank
//      screen: 1) all connectors, 2) injected() only (retry), 3) none (EIP-6963 discovery still works).
// [TR] miniAppConnectorImporter yalnız mini app içinde verilir; hata olursa normal bağlayıcılar etkilenmez.
// [TR] walletConnectOptions yalnız geçerli proje kimliğiyle verilir (resolveWalletConnectOptions); yoksa WC hiç eklenmez.
//      WC oluşturma hatası diğer bağlayıcıları etkilemez.
export const loadConnectorsSafely = async (importer = () => import('wagmi/connectors'), logger = console, miniAppConnectorImporter = null, walletConnectOptions = null) => {
  try {
    const { coinbaseWallet, injected, walletConnect } = await importer();
    const list = [
      injected(), // OKX Wallet ve diğer injected cüzdanlar
      coinbaseWallet({ appName: 'Araf Protocol' }),
    ];
    if (walletConnectOptions && isValidWalletConnectProjectId(walletConnectOptions.projectId) && typeof walletConnect === 'function') {
      try {
        list.push(makeLazyConnector(walletConnect({ ...walletConnectOptions, showQrModal: true })));
      } catch (err) {
        logger.error('[bootstrap] WalletConnect connector unavailable; continuing without it', err);
      }
    }
    if (miniAppConnectorImporter) {
      try {
        const { farcasterMiniApp } = await miniAppConnectorImporter();
        list.unshift(farcasterMiniApp());
      } catch (err) {
        logger.error('[bootstrap] mini app connector unavailable; continuing without it', err);
      }
    }
    return list;
  } catch (err) {
    logger.error('[bootstrap] connectors chunk failed to load; retrying with injected() only', err);
  }
  try {
    const { injected } = await importer();
    return [injected()];
  } catch (err) {
    logger.error('[bootstrap] injected connector unavailable; continuing without connectors', err);
    return [];
  }
};

export const renderFatalReload = (container, message = 'Uygulama yüklenemedi. / The app failed to load.') => {
  if (!container) return;
  container.textContent = '';
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'padding:2rem;font-family:sans-serif;text-align:center';
  const p = document.createElement('p');
  p.textContent = message;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Yeniden yükle / Reload';
  btn.onclick = () => window.location.reload();
  box.append(p, btn);
  container.append(box);
};
