# Çok ağ ve Base içi USDT→USDC dönüştürme: iş büyüklüğü

Tarih: 2026-10-27. Salt okuma araştırma; canlı sisteme erişilmedi. Satır numaraları grep çıktısından alındı.

## Özet
- **Çok ağ (önce Arbitrum One, tek pazar): XL.**
  - Yaklaşık 170 dosya ve 3-4 bin satır. Bu tahmin kaba; yalnız hedefli arama yapıldı.
  - Kontrat kodu ağdan bağımsız, `contracts/src` değişmiyor. İş backend, frontend, deploy ve CI tarafında.
- **Base içi dönüştürme: S-M.**
  - Yaklaşık 6 dosya ve 500 satır.
  - Yalnız frontend değişiyor; kontrat ve backend aynı kalıyor.
  - REST tabanlı sağlayıcıyla yeni paket gerekmiyor, CSP de değişmiyor.
- **Öneri: önce dönüştürme.** Ne kadar kullanıcının dönüştürdüğünü ölçüp çok ağ kararını o veriye göre verelim.

## Kontrat (değişiklik yok)
- `contracts/src` içinde `block.number`, `chainid`, OP Stack precompile ya da `L1Block` kullanımı yok. Arbitrum'un `block.number` farkı kontratı etkilemiyor.
- Zaman ölçümü yalnız `block.timestamp` ile yapılıyor.
- Token'lar ağ başına `setTokenConfig` ile ayarlanıyor. USDT0 yeni ağda yalnız bir yapılandırma işi.
- Deploy betiği yalnız Base için yazılmış:
  - `deploy.js`: `PUBLIC_CHAIN_IDS = {8453, 84532}`; diğer chainId'lerde `throw` (satır 143).
  - `hardhat.config.js`: yalnız Base ağları tanımlı.
  - Bu kısım S-M büyüklükte.
- Doğrulanamadı: Polygon'un Cancun desteği ve bytecode boyutu.

## Backend: tek ağ varsayımları
- **Listener tek:**
  - `eventListener.js:663-718`: tek RPC, tek escrow adresi, tek vault/rewards.
  - Redis anahtarları (`worker:last_block`) ağa göre ayrılmıyor.
  - Finality derinliği Base'e göre ayarlı (6 blok). Arbitrum'da blok süresi yaklaşık 0,25 sn olduğu için bu yetersiz.
- **Kimlik çakışması:**
  - `Order.onchain_order_id` ve `Trade.onchain_escrow_id` tek başına unique (`Order.js:24`, `Trade.js:32`).
  - İki ağda aynı numara üretildiğinde ikinci kayıt reddedilir.
  - Hiçbir modelde `chain_id` alanı yok.
  - `TerminalTradeStat.trade_key`, `RewardEpoch` ve event koleksiyonları da aynı sorundan etkileniyor.
- **Kritik güvenlik noktası:**
  - PII, dekont ve işlem uçları kaydı yalnız ID ile buluyor: `pii.js:163`, `trades.js:389`, `receipts.js:131`.
  - Çok ağda aynı ID iki ayrı işlemi gösterir.
  - Bu yüzden tüm uçlar chainId almalı. Taraf kontrolü (`maker/taker == oturum`) korunmalı.
- **İtibar:** Kontrat itibarı escrow başına tutuyor, yani her ağda ayrı. Backend ise cüzdan başına tek bir `User` aynası tutuyor. Model kararı gerekiyor.
- **Diğer tek-ağ noktaları:**
  - `expectedChain.js`
  - `rpcProvider.js`
  - `health.js`
  - `jobLock.js`
  - `protocolConfig.js`
  - `escrowRegistryGuard.js` (tek `active` kaydı)
  - `tokenEnv.js` (yalnız 8453/84532)
  - `siwe.js` (tek chainId)
  - relayer işleri (tek anahtar, her ağda gas gerekir)
  - `/orders/config` (tek `deployment`)

## Frontend: tek ağ varsayımları
- `chainPolicy.js`: üretimde tek zincir; `VITE_TARGET_CHAIN` yalnız base veya base-sepolia.
- `main.jsx`: wagmi yalnız Base ağlarıyla kurulu; tek `VITE_RPC_URL`.
- `useArafContract.js:124`: tek `VITE_ESCROW_ADDRESS`, 40'tan fazla yerde kullanılıyor.
- `useRewardsContract.js` ve `App.jsx`: tek adres ve tek token tablosu.
- `txGasFee.js`: L1 ücreti yalnız OP Stack ağlarında hesaplanıyor. Arbitrum'da `null` dönmesi muhtemelen doğru, ama doğrulanmadı.
- Builder Code yalnız Base'de uygulanmalı.
- `knownTrades.js` zaten zincir:escrow anahtarı kullanıyor; değişiklik gerekmiyor.
- Pazar ve işlem odası için gerekenler:
  - ağ rozeti ve filtresi,
  - ilanın ağına geçiş,
  - ilan ağına karşı ağ uyuşmazlığı kontrolü (bugün yok).

## Test, CI ve operasyon
- 92 test dosyası chainId kullanıyor, 45 test dosyası onchain ID kullanıyor.
- Deploy workflow'ları Base Sepolia'ya sabitlenmiş. Her yeni ağ için kopya iş akışı ya da matrix gerekecek.
- Her ağ için ayrıca gerekenler:
  - RPC,
  - adresler,
  - deploy bloğu,
  - relayer gas,
  - owner/Safe,
  - treasury kararı.
- Fly şu an tek makine varsayımıyla çalışıyor. Karar gerekiyor: ağ başına ayrı app mi, yoksa tek süreçte N listener mı?

## İş paketleri (çok ağ)
Ortak ARAYÜZ:
- **Kimlik:** Her kayıtta `chain_id` olur. Bileşik anahtar `"<chainId>:<id>"` olur. API `?chainId=` alır; geçişte varsayılan 8453, sonra zorunlu.
- **Chain registry:** `{chainId, name, rpcEnv, escrow, vault, rewards, deployBlock, tokens, finalityDepth, explorer, isOpStack, builderCode}`. Backend `config/chains.js`, frontend `app/chainRegistry.js`.
- **API:** Her ilan `chainId` ve `orderKey` döner. `/orders/config` → `deployments[]` (eski alan kalır).
- **Redis anahtarları:** `worker:<chainId>:...`
- **Mongo indeksleri:** `{chain_id, onchain_order_id}` ve `{chain_id, onchain_escrow_id}` unique.

| # | Paket | Büyüklük | Risk |
|---|---|---|---|
| P1 | Deploy betikleri ve hardhat'te çok ağ | M (6 dosya) | Düşük |
| P2 | Veri modeli: `chain_id`, bileşik indeks, 8453 backfill, itibar modeli | L (~15 dosya + ~60 test) | Yüksek: canlı Mongo indeks değişikliği |
| P3 | Ağ başına listener, provider, finality, health, kilitler | XL (~12 dosya, 800-1200 satır) | Yüksek: veri kaybı ya da çift işleme |
| P4 | API, auth, PII, işler; chainId parametresi; SIWE ağ kümesi | L (~15 dosya) | Yüksek: ödeme verisine erişim |
| P5 | Frontend çekirdek: registry, wagmi, ağa göre adres, Builder Code yalnız Base | L (~12 dosya) | Orta-yüksek: yanlış ağda imza |
| P6 | Pazar ve işlem odası: ağ rozeti, filtre, ağ geçişi | M-L (~10 dosya) | Orta |
| P7 | Test, CI, ops | L (~100 küçük dosya) | Orta |

Sıra:
- **Aşama 0:** Kararlar.
- **Aşama 1:** P1 + P2 + registry. Davranış yalnız Base olarak kalır.
- **Aşama 2:** P3 + P4 + P5.
- **Aşama 3:** Arbitrum Sepolia + P6 + P7.
- **Aşama 4:** Arbitrum mainnet, ardından OP/Unichain. Polygon en son.

## Base içi USDT→USDC dönüştürme
Escrow'a her zaman Base'deki native USDC girer. Kullanıcı ilan açmadan ya da doldurmadan önce USDT'sini uygulama içinde USDC'ye çevirir. USDT başka bir ağda (Arbitrum USDT0, Ethereum, Tron) ya da Base'de olabilir.

| Sağlayıcı | Biçim | Yeni paket | API anahtarı | Not |
|---|---|---|---|---|
| Across Swap API | REST + mevcut viem | Yok | Var (Integrator ID) | Base destekli; Arbitrum→Base USDC örneği var. USDT ve Tron doğrulanamadı |
| Uniswap Trading API | REST | Yok | Var | Yalnız Base içi USDT→USDC; köprü yok |
| 0x Cross-Chain API | REST | Yok | Var | Özel beta, erişim talebi gerekiyor |
| Relay | REST / SDK | REST'te yok | ? | Dolum süresi p50 < 3 sn; Base ve Tron ayrıntısı doğrulanamadı |
| LI.FI widget/SDK | React paketi ya da iframe | Var (birden çok) | ? | Hazır arayüz; Tron için ayrı paket var. Temmuz 2024'te ~9-10 M$ exploit |
| Stargate | Köprü | ? | ? | Yalnız köprü; ayrıca swap gerekiyor |

- **Uygulamada yeri:**
  - doldurma onayı (`FillConfirmSheet.jsx`, `useFillConfirm.js`),
  - ilan formu (`useMakerOrderForm.js`),
  - bakiye bileşeni (`useTokenBalances.js`).
  - Akış: "USDC yetersiz → Çevir". Escrow akışından önce, ayrı bir işlem olarak çalışır.
- **CSP:** REST için `connect-src https:` zaten izinli; değişiklik gerekmiyor. LI.FI iframe kullanılırsa `frame-src` gevşetilmeli (onay kapısı).
- **API anahtarı:** Gizli anahtar frontend'de durmamalı. Ya backend proxy gerekir ya da sağlayıcının herkese açık istemci anahtarı kabul edilmeli.
- **Büyüklük (REST):**
  - Yeni `crossChainSwap.js` ve `SwapToUsdcSheet.jsx`, bağlantılar ve testler: yaklaşık 6 dosya, 500 satır, M.
  - Yalnız Base içi swap: S-M.

## Onay gerektirenler
1. Canlı Mongo indeks değişikliği ve backfill (çok ağ).
2. SIWE'ı çoklu ağa genişletmek. Bu bir güvenlik gevşetmesi.
3. İtibar modeli: ağ başına mı, tek kayıt mı?
4. Fly mimarisi: ağ başına app mi, tek süreç mi?
5. Builder Code yalnız Base'de mi?
6. Treasury ve owner ağ başına mı?
7. Dönüştürme için:
   - yeni paket (LI.FI/Relay SDK) ya da paketsiz REST seçimi,
   - iframe için CSP,
   - API anahtarının nerede tutulacağı.

## Doğrulanamayanlar
- Bytecode boyutu ve Polygon'un Cancun desteği.
- Arbitrum'a özgü değerler: finality, getLogs limiti, L1 ücreti.
- Bazı deploy betikleri okunmadı.
- Sağlayıcıların güncel ücretleri, USDT0/Tron desteği ve LI.FI dışındaki güvenlik geçmişi.
- Test güncellemesinin gerçek maliyeti; yalnız dosya sayıldı.

Kaynaklar:
- [Across Swap API](https://docs.across.to/introduction/swap-api)
- [0x Cross-Chain](https://docs.0x.org/docs/cross-chain-api/guides/get-started)
- [Uniswap API](https://api-docs.uniswap.org/guides/building_prerequisites)
- [Relay zincirleri](https://docs.relay.link/solutions/chains)
- [LI.FI widget](https://docs.li.fi/widget/configure-widget)
- [LI.FI exploit analizi](https://threesigma.xyz/blog/lifi-exploit)
