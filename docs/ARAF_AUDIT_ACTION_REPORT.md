# Araf Protocol — Testnet Hazırlık Raporu
**Tarih:** Mart 2026 | **Kapsam:** ArafEscrow.sol · Backend · Frontend · Etkileşim Analizi  
**Sonuç:** ⚠️ **Testnet'e Hazır Değil** — 3 kritik akış bloklayıcı mevcut

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Kritik — Testnet'i Bloklıyor](#2-kritik--testneti-bloklıyor)
3. [Yüksek — Fonksiyonel Sorun](#3-yüksek--fonksiyonel-sorun)
4. [Orta — Sprint Sonrası](#4-orta--sprint-sonrası)
5. [Düşük — Kalite ve UX](#5-düşük--kalite-ve-ux)
6. [Güvenlik Değerlendirmesi](#6-güvenlik-değerlendirmesi)
7. [Backend ↔ Frontend ↔ Kontrat Etkileşim Matrisi](#7-backend--frontend--kontrat-etkileşim-matrisi)
8. [Aksiyon Tablosu](#8-aksiyon-tablosu)

---

## 1. Yönetici Özeti

Temel protokol mantığı (Bleeding Escrow, Anti-Sybil, EIP-712 Cancel, itibar sistemi) sağlamdır. Güvenlik açısından kritik audit bulgularının tamamı uygulanmıştır. Ancak **3 adet eksik backend endpoint** tespit edilmiştir; bunlar olmadan testnet kullanıcıları temel işlem akışlarını tamamlayamamaktadır. Ayrıca **test suite'i çalıştırılamamaktadır** (MockERC20 imza uyumsuzluğu). Bu bulgular giderilmeden testnet lansmanı yapılması önerilmez.

### Önceki Audit'ten Tamamlananlar ✅
Tüm C-01..C-04, H-01..H-04, M-01..M-03, D-04 bulguları uygulanmıştır. Kontrat v2.1, App.jsx temizleme, eventListener FIFO düzeltmesi ve clearMasterKeyCache entegrasyonu tamamdır.

---

## 2. Kritik — Testnet'i Bloklıyor

### K-01 · `/api/receipts/upload` endpoint'i eksik — PAID akışı çalışmaz

**Dosya:** `backend/scripts/routes/` (bu dosya mevcut değil)  
**Etki:** Taker, ödeme bildiremez. `handleFileUpload` → `/api/receipts/upload` → 404. `paymentIpfsHash` state'i hiçbir zaman set edilmez. "Ödemeyi Bildirdim" butonu her zaman disabled kalır çünkü `!paymentIpfsHash.trim()` kontrolü geçilemez. **LOCKED → PAID geçişi tümüyle bloke.**

**Kök neden:** App.jsx'te hem file upload hem de `paymentIpfsHash` input var, ancak UI sadece file upload gösteriyor. Promo.md GÖREV D-05'te "geçici çözüm olarak manuel input ekle" denilmişti ama uygulanmamış.

**Hızlı çözüm (testnet):** LOCKED state UI'ında file input'un yanına text input ekle:
```jsx
<input
  type="text"
  placeholder="Dekont URL veya SHA-256 hash"
  value={paymentIpfsHash}
  onChange={e => setPaymentIpfsHash(e.target.value)}
  className="w-full bg-[#0a0a0c] text-white px-3 py-2 rounded-xl border border-[#333] text-sm"
/>
```

**Kalıcı çözüm:** `routes/receipts.js` endpoint'i oluştur: multipart upload → AES-256-GCM şifre → SHA-256 hash dön.

---

### K-02 · `/api/pii/my` endpoint'i eksik — Profil ayarlar sekmesi çalışmaz

**Dosya:** `backend/scripts/routes/pii.js`  
**Etki:** Kullanıcı Profil → Ayarlar sekmesini açtığında mevcut IBAN/banka bilgileri yüklenemiyor. `useEffect` içinde `authenticatedFetch('/api/pii/my')` → 404. `setPiiBankOwner`, `setPiiIban`, `setPiiTelegram` hiçbir zaman çağrılmıyor. Kullanıcı her seferinde bilgilerini sıfırdan girmek zorunda.

**Mevcut `pii.js` endpoint'leri:**
- `POST /request-token/:tradeId` ✓
- `GET /:tradeId` ✓
- `GET /my` ✗ **EKSİK**
- `GET /taker-name/:onchainId` ✗ **EKSİK** (K-03)

**Çözüm:** `pii.js`'e ekle:
```js
router.get("/my", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ wallet_address: req.wallet }).select("pii_data").lean();
    if (!user?.pii_data) return res.json({ pii: null });
    const decrypted = await decryptPII(user.pii_data, req.wallet);
    return res.json({ pii: decrypted });
  } catch (err) { next(err); }
});
```

---

### K-03 · `/api/pii/taker-name/:onchainId` endpoint'i eksik — Triangulation fraud prevention çalışmaz

**Dosya:** `backend/scripts/routes/pii.js`  
**Etki:** Trade Room'da maker için gösterilen "Alıcının Doğrulanmış İsmi" hiçbir zaman yüklenemiyor. Güvenlik uyarısı "Yükleniyor..." durumunda kalıyor. Triangulation dolandırıcılık önlemi işlevsiz.

**App.jsx çağrısı (satır 475):**
```js
authenticatedFetch(`${API_URL}/api/pii/taker-name/${activeTrade.onchainId}`)
```

**Çözüm:** `pii.js`'e ekle:
```js
router.get("/taker-name/:onchainId", requireAuth, async (req, res, next) => {
  try {
    const onchainId = Number(req.params.onchainId);
    const trade = await Trade.findOne({ onchain_escrow_id: onchainId })
      .select("maker_address taker_address").lean();
    if (!trade) return res.status(404).json({ error: "Trade bulunamadı" });
    if (trade.maker_address !== req.wallet)
      return res.status(403).json({ error: "Yalnızca maker görebilir" });
    const takerUser = await User.findOne({ wallet_address: trade.taker_address })
      .select("pii_data").lean();
    if (!takerUser?.pii_data?.bankOwner_enc)
      return res.json({ bankOwner: null });
    const decrypted = await decryptPII(takerUser.pii_data, trade.taker_address);
    return res.json({ bankOwner: decrypted.bankOwner });
  } catch (err) { next(err); }
});
```

---

### K-04 · MockERC20 mint imza uyumsuzluğu — Test suite çalışmaz

**Dosya:** `contracts/src/MockERC20.sol`, `contracts/test/ArafEscrow.test.js`  
**Etki:** `deployAndSetupFixture` içinde:
```js
await mockUSDT.mint(maker.address, INITIAL_BAL); // (address, uint256) — 2 argüman
```
Ancak `MockERC20.sol` sadece `function mint() external` tanımlıyor (argümansız). Ethers.js v6 ABI'de eşleşen selector bulamaz → tüm test suite hata verir. `npx hardhat test` çalışmaz.

**Çözüm:** `MockERC20.sol`'a admin mint fonksiyonu ekle:
```solidity
/// @dev Sadece test ortamı için — production kontratında bu fonksiyon olmamalı
function mint(address to, uint256 amount) external {
    _mint(to, amount);
}
```

---

### K-05 · `AmountExceedsTierLimit` için test case yok

**Dosya:** `contracts/test/ArafEscrow.test.js`  
**Etki:** C-04 fix'i (on-chain tier limit enforcement) test coverage'ı yok. Regresyon tespiti yapılamaz.

**Çözüm:** Test suite'e ekle:
```js
describe("Tier Amount Limits (C-04)", () => {
  it("rejects Tier 0 escrow exceeding 150 USDT limit", async () => {
    const overLimit = ethers.parseUnits("151", USDT_DECIMALS);
    await expect(
      escrow.connect(maker).createEscrow(await mockUSDT.getAddress(), overLimit, 0)
    ).to.be.revertedWithCustomError(escrow, "AmountExceedsTierLimit");
  });

  it("allows Tier 0 escrow within 150 USDT limit", async () => {
    const withinLimit = ethers.parseUnits("150", USDT_DECIMALS);
    await expect(
      escrow.connect(maker).createEscrow(await mockUSDT.getAddress(), withinLimit, 0)
    ).to.not.be.reverted;
  });
});
```

---

## 3. Yüksek — Fonksiyonel Sorun

### Y-01 · Chain ID banner hardcoded 84532, buy butonu 31337 kabul ediyor — Tutarsızlık

**Dosya:** `frontend/src/App.jsx`

```js
// Buy butonu (satır 2128): 31337'yi kabul ediyor
const isCorrectChain = [8453, 84532, 31337].includes(chainId);

// Banner (satır 2557): sadece 84532'yi kabul ediyor
{isConnected && chainId !== 84532 && (
  <div>⚠️ Yanlış Ağ...</div>
)}
```

**Etki:** Yerel Hardhat'te (chainId 31337) test edilirken "Yanlış Ağ" banneri gösterilir ama "Satın Al" butonu aktif olur. Çelişkili UX.

**Çözüm:**
```js
const SUPPORTED_CHAIN_IDS = [8453, 84532, 31337];
// Banner'da:
{isConnected && !SUPPORTED_CHAIN_IDS.includes(chainId) && (
  <div>⚠️ Yanlış Ağ...</div>
)}
```

---

### Y-02 · wagmi config'de Hardhat chain eksik — Yerel test yapılamaz

**Dosya:** `frontend/src/main.jsx`
```js
chains: [base, baseSepolia], // Hardhat (31337) yok
```

**Etki:** `npx hardhat node` + local frontend testi sırasında wagmi chainId 31337'yi tanımıyor. `useChainId()` hook'u undefined veya fallback değer dönebilir.

**Çözüm:**
```js
import { base, baseSepolia, hardhat } from 'wagmi/chains';
// ...
chains: process.env.NODE_ENV === 'development' 
  ? [base, baseSepolia, hardhat] 
  : [base, baseSepolia],
transports: {
  [base.id]: http(),
  [baseSepolia.id]: http(),
  [hardhat.id]: http('http://localhost:8545'),
},
```

---

### Y-03 · `getCooldownRemaining` kontrata eklendi ama frontend'de kullanılmıyor

**Dosya:** `frontend/src/hooks/useArafContract.js`, `frontend/src/App.jsx`  
**Etki:** D-03 fix yarım kaldı. `getCooldownRemaining` view fonksiyonu kontrata eklendi (D-03 fix) ancak `useArafContract.js` export listesinde yok, `App.jsx`'te çağrılmıyor. Anti-sybil kontrolü `cooldownRemaining: 0` hard-coded olarak kalmaya devam ediyor.

**Çözüm — useArafContract.js'e ekle:**
```js
getCooldownRemaining: useCallback(async (address) => {
  if (!_isValidAddress) return 0n;
  try {
    return await publicClient.readContract({
      address: getAddress(ESCROW_ADDRESS),
      abi: ArafEscrowABI,
      functionName: 'getCooldownRemaining',
      args: [getAddress(address)],
    });
  } catch { return 0n; }
}, [publicClient]),
```

**App.jsx anti-sybil effect'ine ekle:**
```js
const { ..., getCooldownRemaining } = useArafContract();
// fetchSybil içinde:
const remaining = await getCooldownRemaining(address);
setSybilStatus({
  funded:            ...,
  cooldownOk:        ...,
  cooldownRemaining: Number(remaining), // artık gerçek değer
});
```

---

### Y-04 · Backend listing POST'u tier kripto limitini doğrulamıyor

**Dosya:** `backend/scripts/routes/listings.js`  
**Etki:** Kullanıcı off-chain ilan oluştururken `limits.max = 2000 USDT` ile Tier 1 ilan açabilir (Tier 1 max = 1500 USDT). Off-chain ilan DB'ye kaydedilir. Sonra `createEscrow(token, 2000e6, 1)` on-chain çağrısı `AmountExceedsTierLimit` ile revert eder. Kullanıcı kafa karışıklığı yaşar: ilan açık görünüyor ama on-chain kilitleme başarısız.

**Çözüm:** `POST /api/listings` handler'ına tier max validasyonu ekle:
```js
// protocolConfig'den tier maxları al veya sabit kullan
const TIER_MAX_CRYPTO = { 0: 150, 1: 1500, 2: 7500, 3: 30000 };
const tierMax = TIER_MAX_CRYPTO[value.tier];
if (tierMax && value.limits.max > tierMax) {
  return res.status(400).json({
    error: `Tier ${value.tier} için maksimum kripto miktarı ${tierMax} USDT/USDC.`,
  });
}
```

---

### Y-05 · `tradeState` başlangıç değeri 'LOCKED' — Trade Room sidebar'dan açılınca hatalı render

**Dosya:** `frontend/src/App.jsx`, satır 86  
```js
const [tradeState, setTradeState] = useState('LOCKED');
```

**Etki:** Kullanıcı sidebar'daki "Odaya Git" butonuyla PAID veya CHALLENGED durumundaki bir trade'e girerken `setTradeState(escrow.state)` çağrılıyor (satır 1857, 2006). Bu doğru. Ancak `handleStartTrade` ile yeni trade başlatıldığında `setTradeState('LOCKED')` çağrılıyor ve bu da doğru. Problem değil — ancak `useState('LOCKED')` başlangıç değeri, bileşen ilk mount'ta herhangi bir trade olmadan render edilirse LOCKED UI'ını gösterir. Belgeleme açısından `null` daha doğru olur.

**Öneri:** `useState(null)` yapıp render fonksiyonunda `tradeState` null guard ekle.

---

## 4. Orta — Sprint Sonrası

### O-01 · İlk deploy'da stats boş görünür (60 sn gecikme)

**Dosya:** `backend/scripts/app.js`  
**Etki:** `runStatsSnapshot` ilk kez 60 saniye sonra çalışır. Bu süre zarfında `/api/stats` `{}` döner. Home sayfasında tüm metrikler sıfır gösterir.

**Çözüm:** `loadProtocolConfig` başarılıysa `runStatsSnapshot()`'ı bir kez gecikme olmadan çalıştır. Ya da stats endpoint'i boş dönünce UI'da "veri toplanıyor" mesajı göster.

---

### O-02 · `tradeHistoryPage` profil modal'ı kapanınca sıfırlanmıyor

**Dosya:** `frontend/src/App.jsx`  
**Etki:** Kullanıcı geçmişi sayfa 3'e kadar çekip modal'ı kapatır ve tekrar açarsa sayfa 3'ten başlar. Beklenti: her açılışta sayfa 1'den başlamak.

**Çözüm:**
```js
const handleAuthAction = () => {
  if (!isConnected) setShowWalletModal(true);
  else if (!isAuthenticated) loginWithSIWE();
  else {
    setProfileTab('ayarlar');
    setTradeHistoryPage(1); // reset
    setShowProfileModal(true);
  }
};
```

---

### O-03 · Event listener HTTP modunda bazı event'leri kaçırabilir

**Dosya:** `backend/scripts/services/eventListener.js`  
**Etki:** `BASE_WS_RPC_URL` tanımsızsa HTTP polling kullanılır. Çok hızlı art arda gelen event'lerde (örneğin test sırasında scriptler zincire hızlı yazarsa) checkpoint güncellenmeden provider değişebilir ve bir blok atlanabilir. Replay mekanizması var ama WebSocket daha güvenilir.

**Çözüm:** Testnet'e geçmeden önce Alchemy/Infura'dan WSS URL al ve `fly.io secrets set BASE_WS_RPC_URL=wss://...` komutuyla set et.

---

### O-04 · `feedbackCategory` modal kapatılınca sıfırlanmıyor

**Dosya:** `frontend/src/App.jsx`  
**Etki:** Kullanıcı kategori seçip göndermeden modal kapatırsa, bir sonraki açılışta önceki kategori seçili gelir.

**Çözüm:** `setShowFeedbackModal(false)` çağrılarından sonra `setFeedbackCategory('')` ekle.

---

### O-05 · `protocolConfig` tier max miktarlarını expose etmiyor

**Dosya:** `backend/scripts/services/protocolConfig.js`  
**Etki:** `CONFIG_ABI` sadece bond BPS okur. Tier max kripto miktarları (`TIER_MAX_AMOUNT_TIER0..3`) backend'e yansımıyor. Y-04'teki backend validasyonu sabit değerlerle yapılmak zorunda (kırılgandır).

**Çözüm:** `CONFIG_ABI`'ye tier max fonksiyonlarını ekle:
```js
"function TIER_MAX_AMOUNT_TIER0() view returns (uint256)",
"function TIER_MAX_AMOUNT_TIER1() view returns (uint256)",
"function TIER_MAX_AMOUNT_TIER2() view returns (uint256)",
"function TIER_MAX_AMOUNT_TIER3() view returns (uint256)",
```
`protocolConfig` nesnesine `tierMaxMap: { 0: ..., 1: ..., 2: ..., 3: ... }` ekle.

---

## 5. Düşük — Kalite ve UX

### D-01 · Trade Room'a ilk girildiğinde timer'lar 15 sn geç gösterilir

**Dosya:** `frontend/src/App.jsx`  
**Etki:** `handleStartTrade` ile girildiğinde `activeTrade` listing datası ile set edilir (timer alanları yok). `fetchMyTrades` polling 15 sn sonra çalışır ve `paidAt`, `lockedAt`, `challengedAt` gibi alanları günceller. Bu süre zarfında grace period timer `00:00:00` gösterir.

**Çözüm:** `handleStartTrade` sonrası `await fetchMyTrades()` çağır (zaten `lockEscrow` sonrası retry loop var, onun ardından).

---

### D-02 · `isWalletRegistered === false` durumunda buy flow net hata vermiyor

**Dosya:** `frontend/src/App.jsx`  
**Etki:** Kayıtsız cüzdan (7 gün yaşlanmamış) buy'a basarsa kontrat `WalletTooYoung` revert eder. Hata mesajı olarak kontrat hata kodu gösterilir, kullanıcı dostu değil. `isWalletRegistered === false` orange banner'ı var ama "Satın Al" butonu yine de aktif.

**Çözüm:** Buy butonu disable koşuluna `isWalletRegistered !== true` ekle:
```js
const finalCanTakeOrder = canTakeOrder && isCooldownOk && isFunded && 
  isTokenConfigured && isCorrectChain && isWalletRegistered === true;
```

---

### D-03 · `handleFileUpload` başarısız olursa sessiz kalıyor

**Dosya:** `frontend/src/App.jsx`  
**Etki:** `/api/receipts/upload` 404 döndürdüğünde `throw new Error(data.error || 'Upload failed')` çalışır ve toast gösterilir. Ancak kullanıcı ne yapması gerektiğini bilmez.

**Çözüm (K-01 hızlı fix ile birlikte):** Dosya yükleme başarısız olursa otomatik olarak manuel hash alanını göster.

---

### D-04 · `ARCHITECTURE_TR.md` bölüm 9.2 tekrarlı başlık

**Dosya:** `docs/ARCHITECTURE_TR.md`  
Bölüm 9.2 başlığı iki kez yazılmış: "PII Şifreleme" ve "Müşterek İptal Akışı" — içerik doğru ancak ilk başlık silinmemiş.

---

## 6. Güvenlik Değerlendirmesi

### ✅ Güçlü Alanlar

| Alan | Durum | Detay |
|------|-------|-------|
| Reentrancy koruması | ✅ Güvenli | Her para transferinde `nonReentrant` + CEI pattern |
| EIP-712 Cancel | ✅ Güvenli | Replay koruması (`sigNonces`), deadline üst sınırı, imza doğrulama |
| JWT güvenliği | ✅ Güvenli | httpOnly cookie, 15 dk TTL, refresh rotation |
| PII şifreleme | ✅ Güvenli | AES-256-GCM, per-wallet HKDF DEK, KMS-ready |
| Anti-Sybil (on-chain) | ✅ Güvenli | Wallet age, dust limit, cooldown, self-trade engeli |
| Tier limit enforcement | ✅ Güvenli | C-04: On-chain `AmountExceedsTierLimit` revert |
| CORS | ✅ Güvenli | Production'da wildcard engelli, origin doğrulama |
| Rate limiting | ✅ Güvenli | Redis sliding window, PII 3/10dk, Auth 10/dk |
| Zero private key | ✅ Güvenli | Backend sadece event yansıtır, imza için private key yok |
| SIWE domain | ✅ Güvenli | `siweDomain` backend'den gelir, frontend hardcode etmez |
| ConflictingPingPath | ✅ Güvenli | MEV/transaction ordering manipülasyon koruması |

### ⚠️ Dikkat Gerektiren Alanlar

| Alan | Risk | Önlem |
|------|------|-------|
| `/api/pii/my` endpoint auth | Orta | Düzeltilirken `requireAuth` middleware'i unutma |
| `/api/pii/taker-name` auth | Orta | Sadece maker erişebilmeli — `trade.maker_address === req.wallet` kontrolü şart |
| Receipts upload endpoint | Orta | Oluşturulursa MIME type ve dosya boyutu limiti ekle |
| `RELAYER_PRIVATE_KEY` scope | Düşük | Mainnet'te Gelato Automation ile değiştirilmeli |

---

## 7. Backend ↔ Frontend ↔ Kontrat Etkileşim Matrisi

| Akış | Frontend Çağrısı | Backend Endpoint | On-chain Fonksiyon | Durum |
|------|-----------------|-----------------|-------------------|-------|
| SIWE Login | `loginWithSIWE()` | `POST /auth/verify` | — | ✅ |
| Cüzdan kaydı | `registerWallet()` | — | `registerWallet()` | ✅ |
| İlan oluştur | `handleCreateEscrow()` | `POST /api/listings` → `POST /api/trades` (event) | `createEscrow()` | ⚠️ Y-04 |
| İlan sil | `handleDeleteOrder()` | `DELETE /api/listings/:id` | `cancelOpenEscrow()` | ✅ |
| Trade başlat | `handleStartTrade()` | `GET /api/trades/by-escrow/:id` (retry) | `lockEscrow()` | ✅ |
| Ödeme bildir | `handleReportPayment()` | `/api/receipts/upload` → hash | `reportPayment()` | ❌ K-01 |
| IBAN görüntüle | `usePII.fetchPII()` | `POST /pii/request-token` → `GET /pii/:id` | — | ✅ |
| Maker IBAN yükle | Profile modal | `PUT /auth/profile` | — | ✅ |
| Profil yükle | Profile modal open | `GET /api/pii/my` | — | ❌ K-02 |
| Taker ismi | Trade Room | `GET /api/pii/taker-name/:id` | — | ❌ K-03 |
| Fon serbest bırak | `handleRelease()` | `POST /trades/:id/chargeback-ack` → event | `releaseFunds()` | ✅ |
| İtiraz ping | `handleChallenge()` | — | `pingTakerForChallenge()` | ✅ |
| İtiraz aç | `handleChallenge()` | — | `challengeTrade()` | ✅ |
| İptal teklifi | `handleProposeCancel()` | `POST /trades/propose-cancel` | `proposeOrApproveCancel()` | ✅ |
| Maker ping | `handlePingMaker()` | — | `pingMaker()` | ✅ |
| Auto release | `handleAutoRelease()` | — | `autoRelease()` | ✅ |
| Burn | burnExpired butonu | — | `burnExpired()` | ✅ |
| Reputasyon | Profile → itibar sekmesi | — | `getReputation()` | ✅ |
| Cooldown süresi | Anti-sybil effect | — | `getCooldownRemaining()` | ⚠️ Y-03 |
| Stats | Home sayfası | `GET /api/stats` (Redis cache) | — | ✅ |
| İlan listesi | Marketplace | `GET /api/listings` | — | ✅ |
| Aktif trade'ler | Sidebar + Profil | `GET /api/trades/my` | — | ✅ |
| Trade geçmişi | Profil → Geçmiş | `GET /api/trades/history` | — | ✅ |
| Decay reputation | İtibar sekmesi | — | `decayReputation()` | ✅ |
| Test faucet | Marketplace | — | `MockERC20.mint()` | ✅ |
| Bond config | İlan modal | `GET /api/listings/config` | `MAKER_BOND_TIER*_BPS` | ✅ |

**Özet:** 26 akıştan 22'si tam çalışır durumda. 3 akış eksik endpoint nedeniyle bloke (K-01, K-02, K-03), 1 akış yarım (Y-03).

---

## 8. Aksiyon Tablosu

### Testnet Öncesi Zorunlu (Bu hafta)

| # | Öncelik | Dosya | İş | Süre (est.) |
|---|---------|-------|-----|------------|
| K-01 | 🔴 Kritik | `App.jsx` + `routes/receipts.js` | `/api/receipts/upload` endpoint'i veya manual hash input | 2-4s |
| K-02 | 🔴 Kritik | `routes/pii.js` | `GET /api/pii/my` endpoint'i ekle | 1s |
| K-03 | 🔴 Kritik | `routes/pii.js` | `GET /api/pii/taker-name/:onchainId` endpoint'i ekle | 1s |
| K-04 | 🔴 Kritik | `MockERC20.sol` | `mint(address, uint256)` admin fonksiyonu ekle | 30dk |
| K-05 | 🔴 Kritik | `ArafEscrow.test.js` | `AmountExceedsTierLimit` negatif test case'leri | 30dk |
| Y-01 | 🟠 Yüksek | `App.jsx` | Chain ID banner tutarsızlığı düzelt | 15dk |
| Y-02 | 🟠 Yüksek | `main.jsx` | wagmi config'e Hardhat chain ekle | 15dk |
| Y-03 | 🟠 Yüksek | `useArafContract.js` + `App.jsx` | `getCooldownRemaining` hook'a ekle ve kullan | 1s |
| Y-04 | 🟠 Yüksek | `routes/listings.js` | Tier kripto max validasyonu ekle | 30dk |

### Bu Sprint (Testnet başladıktan sonra)

| # | Öncelik | Dosya | İş |
|---|---------|-------|-----|
| O-01 | 🟡 Orta | `app.js` | İlk stats snapshot gecikmesini azalt |
| O-02 | 🟡 Orta | `App.jsx` | `tradeHistoryPage` modal açılışında sıfırla |
| O-03 | 🟡 Orta | `fly.toml` / secrets | `BASE_WS_RPC_URL` ekle |
| O-04 | 🟡 Orta | `App.jsx` | `feedbackCategory` modal kapatınca sıfırla |
| O-05 | 🟡 Orta | `protocolConfig.js` | Tier max miktarlarını expose et |

### Sonraki Sprint

| # | Dosya | İş |
|---|-------|-----|
| D-01 | `App.jsx` | Trade Room ilk açılışında `fetchMyTrades()` çağır |
| D-02 | `App.jsx` | Kayıtsız cüzdanda buy butonunu disable et |
| D-04 | `ARCHITECTURE_TR.md` | Tekrarlı bölüm başlığını temizle |

---

## Sonuç

**Protokol güvenliği ve on-chain mantığı testnet için yeterince güçlü.** Bleeding Escrow, Anti-Sybil, EIP-712, PII şifreleme ve event sync mekanizmaları doğru çalışmaktadır.

**Testnet'i blokayan şey yazılım mimarisi değil, 3 eksik API endpoint.** Bu endpoint'lerin oluşturulması tahminen 3-5 saatlik iş. Test suite düzeltmesi (K-04) ek 1 saat. Tüm kritik bulgular giderildikten sonra testnet lansmanı için teknik engel kalmaz.

**Önerilen lansman sırası:**
1. K-01 → K-02 → K-03 (API endpoint'leri) — en kritik
2. K-04 → K-05 (test suite) — `npx hardhat test` geçmeden deploy etme
3. Y-01 → Y-02 (chain ID) — yerel test için
4. Y-04 (listing validasyonu) — kullanıcı deneyimi için

---

*Rapor kapsamı: ArafEscrow.sol (v2.1), backend (Node.js/Express), frontend (React 18 + Wagmi 2), tüm route ve hook dosyaları.*
