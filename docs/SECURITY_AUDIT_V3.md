ARAF PROTOCOL — PUBLIC TESTNET GEÇİŞ RAPORU
Mimari & Siber Güvenlik Tam Denetim
Tarih: 2026-03-15
Denetçi: Claude (Mimari Tasarımcı + Siber Güvenlik Uzmanı)
Kapsam: Tüm dosyalar — Smart Contract / Backend / Frontend / DevOps
Hedef: Base Sepolia Public Testnet'e güvenli geçiş
1. GENEL MİMARİ ÖZET
┌─────────────────────────────────────────────────────────────┐
│                    ARAF PROTOCOL                            │
│              "Trust the Time, Not the Oracle"               │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React + Vite + Wagmi)                            │
│  ├── SIWE Auth → httpOnly Cookie JWT                        │
│  ├── On-chain: Wagmi/Viem direct calls                      │
│  └── Off-chain: REST API calls → Backend                    │
├─────────────────────────────────────────────────────────────┤
│  Backend (Express.js + MongoDB + Redis)                     │
│  ├── Event Worker: On-chain → MongoDB sync                  │
│  ├── SIWE Auth + JWT + Refresh Tokens                       │
│  ├── AES-256-GCM PII encryption                             │
│  └── Zero Private Key (relayer hariç)                       │
├─────────────────────────────────────────────────────────────┤
│  Smart Contract (Solidity 0.8.24, Base L2)                  │
│  ├── ArafEscrow.sol (1146 satır)                            │
│  └── MockERC20.sol (25 satır, testnet only)                 │
└─────────────────────────────────────────────────────────────┘
Teknoloji Stack:
Chain: Base L2 (Mainnet: 8453, Sepolia: 84532)
Contract: Solidity ^0.8.24, OpenZeppelin 5.x
Backend: Express 4.19, MongoDB (Mongoose 8.4), Redis
Frontend: React 18.3, Wagmi 2.12, Viem 2.21
Güvenlik: SIWE (EIP-4361), EIP-712, AES-256-GCM, httpOnly cookies
2. SMART CONTRACT ANALİZİ
2.1 ArafEscrow.sol — Fonksiyon Envanteri
Fonksiyon
Görünürlük
Güvenlik Korumaları
Durum
registerWallet()
external
AlreadyRegistered check
✅
createEscrow()
external
nonReentrant, whenNotPaused
✅
cancelOpenEscrow()
external
nonReentrant, inState(OPEN)
✅
lockEscrow()
external
nonReentrant, notBanned, whenNotPaused
✅
reportPayment()
external
nonReentrant, inState(LOCKED)
✅
releaseFunds()
external
nonReentrant
✅
pingTakerForChallenge()
external
nonReentrant, inState(PAID)
✅
challengeTrade()
external
nonReentrant, inState(PAID)
✅
proposeOrApproveCancel()
external
nonReentrant, EIP-712
✅
burnExpired()
external
nonReentrant, inState(CHALLENGED)
✅
pingMaker()
external
nonReentrant, inState(PAID)
✅
autoRelease()
external
nonReentrant, inState(PAID)
✅
decayReputation()
external
nonReentrant
✅
getTrade()
external view
—
✅
getCurrentAmounts()
external view
—
✅
getReputation()
external view
—
✅
antiSybilCheck()
external view
—
✅
domainSeparator()
external view
—
✅
setTreasury()
external
onlyOwner
✅
setSupportedToken()
external
onlyOwner
✅
pause() / unpause()
external
onlyOwner
✅
2.2 Güvenlik Kontrolleri — Geçilen Denetimler
Kategori
Kontrol
Sonuç
Reentrancy
OpenZeppelin ReentrancyGuard, tüm state-changing fonksiyonlar
✅ GEÇTİ
CEI Pattern
Checks → Effects → Interactions sıralaması
✅ GEÇTİ
Integer Overflow
Solidity ^0.8.24 built-in protection
✅ GEÇTİ
Token Safety
SafeERC20 kullanımı, tüm transferlerde
✅ GEÇTİ
Access Control
onlyOwner, maker/taker rolleri, notBanned
✅ GEÇTİ
EIP-712 Replay
sigNonces per-user counter
✅ GEÇTİ
Emergency Stop
Pausable circuit breaker
✅ GEÇTİ
Anti-Sybil
7-gün yaş kapısı, dust limit, cooldown, wash trading (30-gün)
✅ GEÇTİ
MEV Koruması
ConflictingPingPath hatası (AUDIT FIX C-02)
✅ GEÇTİ
Decay Rounding
Second-based linear decay (AUDIT FIX C-01)
✅ GEÇTİ
Cancel Deadline
MAX_CANCEL_DEADLINE = 7 gün (AFS-017)
✅ GEÇTİ
Token Whitelist
setSupportedToken mapping güncelleme (AFS-001)
✅ GEÇTİ
Tier Sentinel
hasTierPenalty boolean flag (AFS-002)
✅ GEÇTİ
2.3 Contract Zayıf Noktaları (Kabul Edilebilir / Design Choice)
#
Konu
Risk
Değerlendirme
SC-01
Proxy/Upgrade yok
Orta
Tasarım tercihi; redeploy gerektirir. Audit yüzey alanı daha küçük.
SC-02
Treasury tek EOA olabilir
Yüksek
Gnosis Safe 3/5 multisig ZORUNLU. Tek private key = pause yetkisi
SC-03
IPFS hash kriptografik bağ yok
Orta
Off-chain doğrulama katmanı gerektirir
SC-04
Oracle yok (tasarım)
Düşük
P2P rate anlaşması off-chain; fonlar kilitlenmeden önce mutabakat
SC-05
MockERC20 mint() kontrolsüz
Yüksek
TESTNET ONLY — mainnet'e deploy edilmemeli
SC-06
reputationDecay() için RELAYER_PRIVATE_KEY
Orta
"Quasi-Zero Key"; mainnet için Gelato/Chainlink Automation planlandı
3. BACKEND ANALİZİ
3.1 API Endpoint Envanteri
Endpoint
Method
Auth
Rate Limit
Durum
/api/auth/nonce
GET
Yok
authLimiter (20/15dk)
✅
/api/auth/verify
POST
Yok
authLimiter
✅
/api/auth/refresh
POST
Cookie
authLimiter
✅
/api/auth/logout
POST
JWT/Cookie
—
✅
/api/auth/me
GET
JWT/Cookie
—
✅
/api/auth/profile
PUT
JWT/Cookie
—
✅
/api/listings
GET
Yok (public)
—
✅
/api/listings
POST/PUT/DELETE
JWT
—
✅
/api/trades/my
GET
JWT
tradesLimiter (30/dk)
✅
/api/trades/history
GET
JWT
tradesLimiter
✅
/api/trades/:id
GET
JWT
tradesLimiter
✅
/api/trades/propose-cancel
POST
JWT
tradesLimiter
✅
/api/trades/:id/chargeback-ack
POST
JWT
tradesLimiter
✅
/api/pii/:tradeId
GET
PII Token
—
✅
/api/feedback
GET/POST
JWT
feedbackLimiter (10/saat)
✅
/api/stats
GET
Yok (public)
—
✅
/health
GET
Yok
—
✅
3.2 Event Worker ↔ Contract Eşleşmesi
Contract Event
Worker Handler
MongoDB Güncelleme
Durum
WalletRegistered
_onWalletRegistered
User upsert
✅
EscrowCreated
_onEscrowCreated
Trade upsert
✅
EscrowLocked
_onEscrowLocked
Trade.status = LOCKED
✅
PaymentReported
_onPaymentReported
Trade.status = PAID, IPFS hash
✅
EscrowReleased
_onEscrowReleased
Trade.status = RESOLVED
✅
DisputeOpened
_onDisputeOpened
Trade.status = CHALLENGED
✅
CancelProposed
_onCancelProposed
cancel_proposal fields
✅
EscrowCanceled
_onEscrowCanceled
Trade.status = CANCELED
✅
MakerPinged
_onMakerPinged
timers.pinged_at
✅
ReputationUpdated
_onReputationUpdated
reputation_cache (dot notation)
✅
BleedingDecayed
_onBleedingDecayed
financials.total_decayed
✅
EscrowBurned
_onEscrowBurned
Trade.status = BURNED
✅
TreasuryUpdated
YOK
—
⚠️ Admin-only, düşük öncelik
TokenSupportUpdated
YOK
—
⚠️ Admin-only, düşük öncelik
3.3 Backend Güvenlik Kontrolleri
Kontrol
Uygulama
Durum
Helmet (HTTP headers)
CSP, HSTS, nosniff
✅
CORS wildcard engeli
Production'da process.exit(1)
✅
MongoDB Sanitization
express-mongo-sanitize
✅
JWT httpOnly cookies
AUDIT FIX F-01
✅
SIWE_DOMAIN localhost engeli
Production'da process.exit(1)
✅
JWT entropy kontrolü (64 hex)
Başlangıç doğrulaması
✅
Rate limiting (Redis-backed)
Tüm endpointler
✅
Graceful shutdown
SIGTERM/SIGINT
✅
AES-256-GCM PII encryption
KMS provider desteği
✅
IP hash (GDPR)
SHA-256, raw IP saklanmaz
✅
Trust proxy
Production'da set
✅
Redis checkpoint (monoton)
AUDIT FIX B-04
✅
DLQ retry mekanizması
3x retry, alert
✅
4. FRONTEND ANALİZİ
4.1 useArafContract.js ↔ ArafEscrow.sol Eşleşmesi
Contract Fonksiyonu
Hook Metodu
Parametre Uyumu
Durum
registerWallet()
registerWallet
✅
✅
createEscrow(token, amount, tier)
createEscrow
✅
✅
cancelOpenEscrow(tradeId)
cancelOpenEscrow
✅
✅
lockEscrow(tradeId)
lockEscrow
✅
✅
reportPayment(tradeId, ipfsHash)
reportPayment
✅
✅
releaseFunds(tradeId)
releaseFunds
✅
✅
pingTakerForChallenge(tradeId)
pingTakerForChallenge
✅
✅
challengeTrade(tradeId)
challengeTrade
✅
✅
proposeOrApproveCancel(tradeId, deadline, sig)
proposeOrApproveCancel
✅
✅
burnExpired(tradeId)
burnExpired
✅
✅
pingMaker(tradeId)
pingMaker
✅
✅
autoRelease(tradeId)
autoRelease
✅
✅
getReputation(wallet)
getReputation
✅
✅
getTrade(tradeId)
getTrade
✅ (tuple ABI)
✅
getCurrentAmounts(tradeId)
getCurrentAmounts
✅
✅
sigNonces(address)
EIP-712 imzada kullanılıyor
✅
✅
domainSeparator()
EIP-712 domain'de
✅
✅
ERC20 approve(spender, amount)
approveToken
✅
✅
ERC20 allowance(owner, spender)
getAllowance
✅
✅
4.2 EIP-712 Cancel İmzası Uyumu
Alan
Frontend (useArafContract.js)
Contract (ArafEscrow.sol)
Uyum
name
"ArafEscrow"
"ArafEscrow"
✅
version
"1"
"1"
✅
chainId
useChainId() (dinamik)
block.chainid
✅
verifyingContract
ESCROW_ADDRESS
address(this)
✅
CancelProposal.tradeId
BigInt(tradeId)
uint256
✅
CancelProposal.proposer
walletClient.account.address
address
✅
CancelProposal.nonce
BigInt(nonce)
uint256
✅
CancelProposal.deadline
BigInt(deadline)
uint256
✅
Max deadline
7 gün (frontend)
7 gün (contract)
✅
5. TESPİT EDİLEN SORUNLAR
5.1 KRİTİK SORUNLAR
SORUN-01: Frontend JWT State Yönetimi — AUDIT FIX F-01 Sonrası Kırık
Dosya: frontend/src/App.jsx satır 120-228
Açıklama:
AUDIT FIX F-01 ile backend artık JWT'yi httpOnly cookie'de gönderiyor (response body'de değil). Ancak frontend hâlâ:
jwtToken state'ini eski yöntemle doldurmaya çalışıyor (response body'den)
refreshTokenState state'ini hiç dolduramıyor (body'de artık yok)
authenticatedFetch fonksiyonu Authorization: Bearer null gönderiyor (çalışıyor çünkü backend cookie fallback yapıyor ama stale/tehlikeli kod)
Refresh endpoint /api/auth/refresh artık sadece { wallet } döndürüyor, ama frontend refreshData.token ve refreshData.refreshToken bekliyor → undefined değerler
Etki:
Kısmen çalışıyor (cookie-based auth fallback sayesinde)
Ama kod tutarsız, debug edilmesi zor
Refresh flow tamamen işlevsiz (yeni token alınamıyor → 15 dakika sonra oturum kapanır, re-login gerekir)
Çözüm Yönü:
authenticatedFetch'ten Authorization header kaldırılmalı, credentials: 'include' eklenmeli.
Refresh state management kaldırılmalı (artık cookie ile otomatik).
SORUN-02: credentials: 'include' Eksikliği — Cross-Origin Güvenlik Riski
Dosya: frontend/src/App.jsx — tüm fetch() ve authenticatedFetch() çağrıları
Açıklama:
Frontend'deki fetch çağrılarında credentials: 'include' seçeneği kullanılmamıştır. httpOnly cookie'lerin cross-origin requestlerde gönderilmesi için bu gereklidir.
Mevcut durum:
Vercel'in vercel.json proxy'si (/api/* → Fly.io backend) sayesinde şu an aynı-origin gibi davranıyor. Ama:
VITE_API_URL direkt backend URL'ye set edilirse cookie'ler GÖNDERILMEZ
Geliştirici ortamında localhost:5173 (frontend) → localhost:4000 (backend) cross-origin — cookie gitmez
Etki: Geliştirici ortamında auth tamamen bozuk; prod'da Vercel proxy'ye bağımlı.
Çözüm Yönü:
Tüm fetch çağrılarına credentials: 'include' eklenmeli. Backend CORS'ta credentials: true zaten var.
SORUN-03: Auth Route İsim Uyumsuzluğu (verify-signature vs verify)
Dosya: Backend routes/auth.js vs Frontend App.jsx
Açıklama:
Backend route: POST /api/auth/verify
Frontend'in nerede çağırdığına bakılmalı — bazı eski versiyonlarda /verify-signature kullanılıyor olabilir.
Nonce endpoint'i /api/auth/nonce olup, AFS-010 Fix ile siweDomain de dönüyor.
Düzeltme: Frontend'in loginWithSIWE fonksiyonunun /api/auth/verify adresini kullandığından emin olunmalı.
5.2 YÜKSEK ÖNCELİKLİ SORUNLAR
SORUN-04: reputationDecay.js — RELAYER_PRIVATE_KEY Gerekliliği
Dosya: backend/scripts/jobs/reputationDecay.js
Açıklama:
Backend "Zero Private Key" olarak tanımlandı ama reputationDecay job'u decayReputation() kontrat fonksiyonunu çağırmak için RELAYER_PRIVATE_KEY kullanıyor. Bu "Quasi-Zero Key" modeli.
Risk: Private key backend'de saklanıyor → key compromise = unauthorized reputation manipulation.
Çözüm Yönü: Mainnet'e geçişte Gelato Automate veya Chainlink Automation'a taşınmalı (planlanmış).
SORUN-05: MockERC20 mint() — Erişim Kontrolsüz
Dosya: contracts/src/MockERC20.sol
Açıklama:
mint() fonksiyonunda herhangi bir access control yok — herhangi bir adres sınırsız token basabilir.
Risk: Testnet'te kabul edilebilir. Ancak yanlışlıkla production deployment'ına dahil edilirse felakete yol açar.
Çözüm Yönü: Deploy script zaten testnet/mainnet ayrımı yapıyor. Mainnet deployment'ında MockERC20 kesinlikle deploy edilmemeli.
SORUN-06: Treasury — Tek EOA Riski
Dosya: contracts/src/ArafEscrow.sol — constructor parametresi
Açıklama:
Treasury adresi EOA (Externally Owned Account) olarak deploy edilirse:
pause() / unpause() yetkisi tek private key'e bağlı
Tüm protokol fee'leri tek adrese gidiyor
Key kaybı = kalıcı fon kaybı
Çözüm Yönü: Gnosis Safe 3/5 multisig. Deployment script bunu belgelemiş.
SORUN-07: App.jsx Monolitik Yapı (117KB)
Dosya: frontend/src/App.jsx
Açıklama:
Tüm uygulama mantığı tek bir 117KB dosyada. Bu:
Code splitting yok → ilk yüklenme büyük bundle
Test edilmesi imkânsız
State yönetimi dağınık
Security review çok zor
Etki: Doğrudan güvenlik açığı değil ama güvenlik sorunlarının gizlenmesini kolaylaştırıyor.
5.3 ORTA ÖNCELİKLİ SORUNLAR
SORUN-08: Listing ↔ Trade Bağlantısı Gevşek
Dosya: backend/scripts/services/eventListener.js satır 307-338
Açıklama:
EscrowCreated event'inde listing_id MongoDB'den onchain_escrow_id ile bulunmaya çalışılıyor. Ama listing oluşturulurken onchain_escrow_id henüz bilinmiyor (on-chain işlem yapılmadan önce listing oluşturuluyor).
Sonuç: listing hep null geliyor, exchange_rate ve fiat_currency 0/TRY varsayılanıyla kaydediliyor.
Etki: Trade history'de döviz kuru bilgisi hep 0 gösteriliyor.
SORUN-09: successRate Hesaplama Mantık Hatası
Dosya: backend/scripts/services/eventListener.js satır 508-526
Açıklama:
// AFS-018 Fix:
const totalTrades = Number(successful) + Number(failed);
const successRate = totalTrades > 0
  ? Math.round((Number(successful) / totalTrades) * 100)
  : 100;
// reputation_cache.total_trades = Number(successful)  ← YANLIŞ
total_trades alanına successful sayısı yazılıyor, totalTrades değil.
Etki: UI'da gösterilen işlem sayısı, tamamlanan işlem sayısını gösteriyor, toplam işlem sayısını değil.
SORUN-10: WalletConnect Bağlayıcısı Devre Dışı
Dosya: frontend/src/main.jsx
Açıklama:
WalletConnect connector 403 hataları nedeniyle yoruma alınmış. Bu, mobil cüzdan desteğini kaldırıyor.
Etki: MetaMask/Rabby ve Coinbase Wallet ile sınırlı. Mobile-first kullanıcılar için problem.
5.4 DÜŞÜK ÖNCELİKLİ SORUNLAR
#
Sorun
Dosya
Düzeltme Yönü
L-01
successRate başlangıçta %100 (0 trade'de)
eventListener.js
Tasarım tercihi, kabul edilebilir
L-02
filterToken state eklenmiş ama UI'a bağlanmamış
App.jsx
UI filtresini bağla
L-03
sidebarOpen 5 saniye otomatik kapanma — UX sorunu
App.jsx
Kullanıcı tercihine bırak
L-04
TreasuryUpdated ve TokenSupportUpdated eventleri worker'da dinlenmiyor
eventListener.js
Admin-only; düşük öncelik
L-05
Listing'de successRate ve txCount hardcoded 100/0
App.jsx satır 254-255
Backend'den çekilmeli
L-06
AppPastUi.jsx arşivlenmiş ama repo'da var
frontend/src/
Silmek deployment boyutunu küçültür
L-07
Hardhat local (31337) SUPPORTED_CHAINS'e eklenmiş
useArafContract.js
Production build'de kaldır
6. EKSİK VE ÇALIŞMAYAN ALANLAR
6.1 Kesin Çalışmayan Alanlar
Alan
Sorun
Öncelik
JWT Refresh Flow
Frontend refreshData.token/refreshToken beklediği halde backend sadece {wallet} döndürüyor. 15 dakika sonra oturum kapanır, re-login gerekir
🔴 KRİTİK
Dev ortamında Auth
credentials: 'include' olmadan localhost cross-origin cookie çalışmıyor
🔴 KRİTİK
Trade-Listing bağlantısı
Exchange rate ve fiat_currency her zaman 0/TRY kaydediliyor
🟡 YÜKSEK
WalletConnect
Mobil cüzdan desteği devre dışı (403 hatası)
🟡 YÜKSEK
total_trades gösterimi
successful sayısı gösteriliyor, toplam değil
🟡 ORTA
6.2 Testnet'te Doğrulanması Gereken Alanlar
Alan
Test Senaryosu
Not
registerWallet()
7 gün yaş kontrolü bypass edilemez mi?
Testnet'te wallet yaşı 0 → kontrol test edilemez
Anti-Sybil dust check
0.001 ETH minimum kontrolü
Testnet ETH gereksinimine dikkat
Bleeding Escrow decay
10 günlük timeout — hızlandırılmış test gerekir
Hardhat time warp kullanılmalı
EIP-712 cancel
Cross-browser imza uyumluluğu
MetaMask + Rabby + Coinbase
Event Worker checkpoint
Restart sonrası replay
Redis key silinerek test edilmeli
DLQ işlemesi
MongoDB down senaryosu
Kapalı DB ile event test
PII şifreleme/çözme
IBAN tam cycle
AES-256-GCM round-trip
httpOnly cookie
Cookie silinince ne olur
Tarayıcı dev tools ile test
7. PUBLIC TESTNET GEÇİŞ CHECKLİSTİ
PRE-DEPLOYMENT (Geliştirici Ortamı)
[ ] SORUN-01 FIX: authenticatedFetch'te JWT state kaldırılmalı, cookie-based auth'a geçilmeli
[ ] SORUN-02 FIX: Tüm fetch() çağrılarına credentials: 'include' eklenmeli
[ ] SORUN-03 CHECK: /api/auth/verify endpoint adresinin frontend'de doğru olduğu teyit edilmeli
[ ] SORUN-09 FIX: total_trades → totalTrades = successful + failed olarak düzeltilmeli
[ ] SORUN-08 FIX: Listing-Trade ID bağlantısı için ortak referans stratejisi belirlenmeli
[ ] MockERC20 mint() test: Yanlış deployment senaryosu engellendi mi?
[ ] Hardhat test suite çalıştırılmalı: npx hardhat test (862 test - tümü geçmeli)
[ ] Frontend build: npm run build (uyarı yok)
[ ] Backend lint: npm run lint (hata yok)
CONTRACT DEPLOYMENT (Base Sepolia)
[ ] .env hazırlama:
    [ ] DEPLOYER_PRIVATE_KEY=0x... (yalnızca deployment için, sonra kaldırılacak)
    [ ] TREASURY_ADDRESS=<Gnosis Safe multisig 2/3 minimum>
    [ ] BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
    [ ] BASESCAN_API_KEY=<doğrulama için>

[ ] Compile: cd contracts && npx hardhat compile (uyarı olmamalı)
[ ] Deploy: npx hardhat run scripts/deploy.js --network base-sepolia
[ ] BaseScan doğrulama: npx hardhat verify --network base-sepolia <contract_address> <treasury>
[ ] Ownership transfer: scripts/deploy.js bunu otomatik yapıyor — teyit et
[ ] Token whitelist: setSupportedToken(USDT_ADDRESS, true) çağrıldı mı?
[ ] Contract adresi not edildi: ARAF_ESCROW_ADDRESS=0x...
[ ] MockERC20 adresi not edildi: USDT_ADDRESS=0x...
BACKEND DEPLOYMENT (Fly.io)
[ ] .env hazırlama:
    [ ] NODE_ENV=production
    [ ] ARAF_ESCROW_ADDRESS=<deployed address>
    [ ] CHAIN_ID=84532
    [ ] BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
    [ ] BASE_WS_RPC_URL=wss://... (gerçek zamanlı event için ZORUNLU)
    [ ] MONGODB_URI=mongodb+srv://...
    [ ] REDIS_URL=redis://...
    [ ] JWT_SECRET=<64 hex char minimum>
    [ ] MASTER_ENCRYPTION_KEY=<32 byte hex>
    [ ] SIWE_DOMAIN=<gerçek domain, localhost değil>
    [ ] ALLOWED_ORIGINS=https://your-frontend.vercel.app
    [ ] TREASURY_ADDRESS=<multisig address>

[ ] CORS wildcard kontrolü: ALLOWED_ORIGINS'te * yok
[ ] SIWE_DOMAIN localhost değil
[ ] JWT_SECRET entropi kontrolü (app başlarken otomatik kontrol ediyor)
[ ] Health check: curl https://backend.fly.dev/health → {"status":"ok"}
[ ] Event worker aktif mi? Logs'ta "[Worker] Event listener active" görülmeli
[ ] Redis checkpoint test: İlk restart'ta missed events replay oldu mu?
FRONTEND DEPLOYMENT (Vercel)
[ ] .env hazırlama:
    [ ] VITE_API_URL=https://backend.fly.dev (veya Vercel proxy için boş)
    [ ] VITE_ESCROW_ADDRESS=<deployed contract address>
    [ ] VITE_USDT_ADDRESS=<MockERC20 address>
    [ ] VITE_USDC_ADDRESS=<USDC address if applicable>

[ ] Vercel.json proxy: /api/* → backend URL (cookie forwarding için proxy tercih edilir)
[ ] EnvWarningBanner görünmüyor (env değişkenleri doğru set)
[ ] Chain bağlantısı: MetaMask'ı Base Sepolia'ya bağla (Chain ID: 84532)
[ ] Wallet kayıt testi: registerWallet() çağrısı → event listener güncelliyor mu?
[ ] SIWE login testi: Tam login flow (nonce → sign → verify → me)
[ ] Cookie test: Tarayıcı dev tools → Application → Cookies → araf_jwt httpOnly=true
POST-DEPLOYMENT DOĞRULAMA
[ ] HAPPY PATH TAM DÖNGÜSÜ:
    [ ] Maker: registerWallet() → createEscrow() → listing oluştur
    [ ] Taker: registerWallet() → lockEscrow()
    [ ] Taker: reportPayment() + IPFS hash
    [ ] Maker: chargeback-ack → releaseFunds()
    [ ] Her adımda event worker MongoDB'ye yazdı mı? (Trade.status kontrol)

[ ] DISPUTE DÖNGÜSÜ:
    [ ] pingTakerForChallenge() → 24 saat bekle → challengeTrade()
    [ ] getCurrentAmounts() decay değerleri azalıyor mu?
    [ ] burnExpired() 10 gün sonra çalışıyor mu? (Hardhat time warp ile test)

[ ] CANCEL DÖNGÜSÜ:
    [ ] Maker: signCancelProposal() → propose-cancel API
    [ ] Taker: signCancelProposal() → propose-cancel API
    [ ] Kontrata proposeOrApproveCancel() çağrısı

[ ] PII DÖNGÜSÜ:
    [ ] Profil güncelle: PUT /api/auth/profile
    [ ] Trade odası: PII token al
    [ ] PIIDisplay: IBAN şifreli alınıyor, çözülüyor, görüntüleniyor

[ ] GÜVENLİK TESTLERİ:
    [ ] CORS: Farklı origin'den API çağrısı → reddediliyor mu?
    [ ] Rate limit: /api/auth/nonce'a 21 istek → 429 döndürüyor mu?
    [ ] Banned wallet: lockEscrow() → TakerBanActive hatası?
    [ ] Wrong chain: Ethereum mainnet'te işlem → hata mesajı?
    [ ] MockERC20 allowance: approve() olmadan createEscrow() → revert?
8. MİMARİ DEĞERLENDİRME — GÜÇLÜ YÖNLER
✅ Contract: Kapsamlı denetim geçmişi (AFS-001..020, AUDIT FIX C-01..05)
✅ Contract: ReentrancyGuard + CEI pattern tutarlı uygulanmış
✅ Contract: EIP-712 + nonce replay koruması
✅ Contract: Anti-Sybil çok katmanlı (yaş + dust + cooldown + tier lock)
✅ Contract: Bleeding Escrow zaman-bazlı çözüm mekanizması özgün ve iyi tasarlanmış
✅ Backend: Helmet + MongoDB sanitization + rate limiting katmanlı savunma
✅ Backend: AES-256-GCM envelope encryption PII için sektör standardı
✅ Backend: httpOnly cookie JWT (XSS'e karşı doğru yaklaşım)
✅ Backend: Event-driven sync (checkpoint + DLQ + retry) production-grade
✅ Backend: Graceful shutdown + trust proxy production-ready
✅ Frontend: Chain ID validation (CON-09 Fix)
✅ Frontend: ERC20 approve → allowance → createEscrow sırası (KRIT-01/02)
✅ Frontend: Wallet registration on-chain check (KRIT-04)
✅ Frontend: getCurrentAmounts 30s polling (H-03)
✅ DevOps: Docker + Vercel + Fly.io production-ready konfigürasyon
9. ÖZET DEĞERLENDİRME — TESTNET'E HAZIRLIK SKORU
Kategori
Skor
Açıklama
Smart Contract Güvenliği
9/10
Kapsamlı denetim geçmiş; proxy yok (tasarım tercihi)
Backend Güvenliği
8/10
Çok katmanlı savunma; relayer key risk
Frontend-Contract Uyumu
9.5/10
Tüm fonksiyonlar eşleşiyor; ABI doğru
Frontend-Backend Auth
5/10
🔴 httpOnly cookie geçişi yarım kalmış; refresh kırık
Event Worker Güvenilirliği
9/10
DLQ + checkpoint + replay; listing bağlantısı gevşek
DevOps Hazırlığı
8/10
Docker + Vercel + env validation güçlü
GENEL TESTNET HAZIRLIĞI
7.5/10
2 kritik fix sonrası geçişe hazır
Testnet Geçişi için Zorunlu Ön Koşullar (Blokörler)
SORUN-01 + SORUN-02: Frontend auth akışı cookie-based'e tam geçiş + credentials: 'include'
SORUN-09: total_trades DB alanı düzeltilmeli (yanlış veri yayılımını önlemek için)
Testnet Geçişi Sonrası Yapılabilecekler
SORUN-04: RELAYER_PRIVATE_KEY → Gelato Automation (mainnet öncesi)
SORUN-07: App.jsx component'lara bölünmesi (test coverage için)
SORUN-08: Listing-Trade bağlantısı stratejisi
WalletConnect yeniden entegrasyon (v2 API key ile)
10. KRİTİK DOSYALAR REFERANSı
Dosya
Kritiklik
Not
contracts/src/ArafEscrow.sol
⭐⭐⭐
Ana kontrat — deploy edilecek
backend/scripts/services/eventListener.js
⭐⭐⭐
Blockchain-DB köprüsü
backend/scripts/services/encryption.js
⭐⭐⭐
PII şifreleme — master key kritik
backend/scripts/middleware/auth.js
⭐⭐⭐
JWT + Cookie auth gatekeeping
frontend/src/hooks/useArafContract.js
⭐⭐⭐
Contract-Frontend köprüsü
frontend/src/App.jsx
⭐⭐⭐
🔴 Auth state yönetimi bozuk
backend/scripts/routes/auth.js
⭐⭐
SIWE + JWT endpoints
backend/scripts/app.js
⭐⭐
Bootstrap + security middleware
contracts/scripts/deploy.js
⭐⭐
Deployment sırası önemli
contracts/src/MockERC20.sol
⭐
Testnet-only, mainnet'e deploy edilmemeli
