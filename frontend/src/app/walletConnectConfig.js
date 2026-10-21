// [TR] WalletConnect (Reown) yapılandırması: yalnız GEÇERLİ proje kimliğiyle bağlayıcı üretilir.
//      Kimlik yoksa/boşsa/biçimi bozuksa bağlayıcı hiç yüklenmez; yer tutucu kimlikle ağ isteği (Reown 403) atılmaz.
// [EN] WalletConnect (Reown) config: a connector is built ONLY for a valid project id. Missing/empty/malformed
//      id means no connector at all, so no request is ever made with a placeholder id (no Reown 403).

// Reown proje kimliği = 32 hex karakter. / Reown project id = 32 hex chars.
const PROJECT_ID_RE = /^[0-9a-f]{32}$/i;

export const isValidWalletConnectProjectId = (id) => typeof id === 'string' && PROJECT_ID_RE.test(id.trim());

// [TR] metadata.url = VITE_PUBLIC_URL (varsa) yoksa window.location.origin; icons = sitenin kendi logosu (mutlak URL).
export const buildWalletConnectMetadata = ({ publicUrl, origin } = {}) => {
  const raw = String(publicUrl || '').trim().replace(/\/+$/, '');
  const base = (raw && /^https?:\/\//i.test(raw) ? raw : '') || String(origin || '').replace(/\/+$/, '');
  return {
    name: 'Araf Protocol',
    description: 'Araf Protocol',
    url: base,
    icons: base ? [`${base}/icon-192.png`] : [],
    // [TR] redirect.universal = url ile aynı taban; native için güvenilir değer yok, eklenmez. Taban yoksa alan yok.
    ...(base ? { redirect: { universal: base } } : {}),
  };
};

// [TR] Geçerli kimlik varsa { projectId, metadata, showQrModal:true }, yoksa null.
export const resolveWalletConnectOptions = (env = {}, win = typeof window !== 'undefined' ? window : null) => {
  const projectId = typeof env.VITE_WALLETCONNECT_PROJECT_ID === 'string' ? env.VITE_WALLETCONNECT_PROJECT_ID.trim() : '';
  if (!isValidWalletConnectProjectId(projectId)) return null;
  return {
    projectId,
    metadata: buildWalletConnectMetadata({ publicUrl: env.VITE_PUBLIC_URL, origin: win?.location?.origin }),
    showQrModal: true,
  };
};

// [TR] wagmi walletConnect.setup() sayfa açılır açılmaz Reown'a bağlanır (her ziyaretçi için). setup'ı etkisiz
//      kılıp sağlayıcıyı ilk kullanımda (bağlan/yeniden bağlan) tembel başlatırız.
// [EN] wagmi's walletConnect.setup() contacts Reown on every page load. Drop setup so the provider initialises
//      lazily on first use (connect / reconnect).
export const makeLazyConnector = (factory) => (config) => {
  const connector = factory(config);
  return { ...connector, setup: undefined };
};
