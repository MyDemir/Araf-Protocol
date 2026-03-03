
# 🌀 Araf Protocol: DB & Security Architecture (v1.0)

Bu doküman, Araf Protocol'ün **Web2.5 Hibrit Mimarisini**, MongoDB veri şemalarını ve uçtan uca güvenlik protokollerini tanımlar.

---

## 🏗️ 1. Genel Mimari Yaklaşımı (On-Chain vs Off-Chain)

Araf Protocol, hızı artırmak ve maliyeti düşürmek için verileri iki katmanda yönetir:

| Veri Türü | Saklama Alanı | Teknoloji | Güvenlik |
| --- | --- | --- | --- |
| **Varlıklar (Escrow)** | On-Chain | Base Network (L2) | Smart Contract (Immutable) |
| **İtibar (Reputation)** | On-Chain | Base Network (L2) | Smart Contract (Public Proof) |
| **Pazar Yeri (Orderbook)** | Off-Chain | MongoDB | Indexing & Caching |
| **Kişisel Veri (IBAN/PII)** | Off-Chain | MongoDB (Encrypted) | Envelope Encryption (KMS) |
| **Hızlı Doğrulama** | In-Memory | Redis | 5min TTL & Rate Limiting |

---

## 🗄️ 2. Veritabanı Şemaları (MongoDB Collections)

### 📂 `Users`

Kullanıcıların kimlik ve şifreli banka verilerini tutar.

* **Kritik:** PII verileri asla düz metin olarak kaydedilmez.

```json
{
  "wallet_address": "String (Unique Index)",
  "pii_data": {
    "bank_owner_enc": "AES-256-GCM String",
    "iban_enc": "AES-256-GCM String",
    "telegram_enc": "AES-256-GCM String"
  },
  "reputation_cache": { "success_rate": "Number", "total_trades": "Number" },
  "created_at": "Date"
}

```

### 📂 `Listings`

Pazar yerindeki aktif ilanları tutar.

* **Index:** `{ status: 1, fiat_currency: 1, "limits.min": 1, "limits.max": 1 }`

```json
{
  "maker_address": "String",
  "crypto": "String (USDT/USDC)",
  "fiat": "String (TRY/USD)",
  "rate": "Decimal128",
  "limits": { "min": "Number", "max": "Number" },
  "status": "String (OPEN/PAUSED/CLOSED)"
}

```

---

## 🔐 3. Güvenli Katman (The Secure Layer)

Senin denetimin (Audit) sonucu eklenen ve projenin güvenliğini "kurumsal" seviyeye taşıyan protokoller:

### 🔴 P0: Zero Private Key (Relayer Pattern)

Backend sunucusunda hiçbir cüzdan veya private key bulunmaz. Backend sadece bir **Relayer** görevi görür.

* **Müşterek İptal (Collaborative Cancel):** İki taraf da **EIP-712** formatında mesaj imzalar.
* **On-Chain Tetikleme:** İmzalar toplandıktan sonra işlemi taraflardan biri (Taker veya Maker) kontrata göndererek sonlandırır.

### 🔴 P1: Envelope Encryption (Zarf Şifreleme)

PII verileri MongoDB'ye yazılmadan önce Backend KMS (Key Management System) aracılığıyla şifrelenir.

* **HSM Protection:** Master Key, HSM içinde kalır ve RAM'e asla gelmez.
* **Ephemeral Tokens:** IBAN görüntüleme istekleri için trade bazlı, tek kullanımlık (One-time) tokenlar kullanılır.

### 🟠 P2: Anti-Sybil & Blacklist

* **Economic Barrier:** Yeni cüzdanlar (7 günden genç) veya sıfır reputasyonlu kullanıcılar için Tier 1 (%0 Bond) kilitlidir. Bu kullanıcılar güven inşa edene kadar Taker olsalar bile Bond kilitlemek zorundadır.
* **Rate Limiting:** IBAN/PII endpointleri Redis üzerinden `Wallet + IP` bazlı kısıtlanır (Örn: 10 dakikada max 3 istek).

---

## 🔄 4. İşlem Akış Şeması (Trade Lifecycle)

1. **LOCKED:** Taker işlemi başlatır → On-chain kontrat fonları kilitler.
2. **PII FETCH:** Taker, Backend'den deşifre edilmiş IBAN'ı ephemeral token ile çeker.
3. **PAID:** Taker parayı gönderir ve dekont hash'ini girer → 48 Saatlik **Grace Period** başlar.
4. **CHALLENGED (ARAF):** Anlaşmazlık çıkarsa asimetrik erime başlar.
5. **SETTLEMENT:** Ya Maker serbest bırakır ya da her iki tarafın **EIP-712** imzasıyla "Müşterek İptal" gerçekleşir.

---

## 📋 5. Güvenlik Denetim Özeti (Audit Findings)

| Bulgular | Risk | Çözüm Durumu |
| --- | --- | --- |
| **JWT Token Hijacking** | Kritik | Ephemeral Trade-Scoped Token eklendi |
| **Backend PK Theft** | Kritik | Relayer Mimarisine geçildi (EIP-712) |
| **PII Data Sızıntısı** | Kritik | KMS Envelope Encryption eklendi |
| **Event Sync Çöküşü** | Yüksek | The Graph (Subgraph) planlandı |
| **XSS / Injection** | Orta | Regex Sanitizer & Content Security Policy 
