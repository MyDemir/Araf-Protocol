# PII Encryption HKDF Migration Runbook'u

> Kapsam: `backend/scripts/services/encryption.js` tarafından üretilen şifreli PII payload'ları.
>
> Bu doküman bir **migration/runbook gereksinimidir**. Kod artık Node.js native `crypto.hkdf()` kullanır; ancak mevcut şifreli kayıtlar otomatik olarak yeniden şifrelenmiş sayılmaz. Format detection, testler, backup ve rollback hazırlanmadan destructive migration çalıştırılmamalıdır.

## 1) Ne değişti?

`ArafEncryption`, konfigüre edilen master key ve normalize edilmiş wallet adresinden wallet'a özel data encryption key (DEK) türetir. Güncel implementasyon Node.js native `crypto.hkdf("sha256", masterKey, salt, info, 32)` kullanır:

- salt: `sha256("araf-pii-salt-v1:<normalized-wallet>")`
- info: `"araf-pii-dek-v1"`
- çıktı: 32-byte AES-256-GCM key

Önceki implementasyon RFC 5869 uyumlu HKDF yerine iki zincirlenmiş HMAC operasyonu kullanıyordu. AES-GCM payload framing aynı kaldı (`iv` + `authTag` + `ciphertext` hex); bu yüzden eski ve yeni payload'lar storage formatı seviyesinde aynı görünebilir.

### 1.1) Master key kaynakları (`KMS_PROVIDER`)

Master key süreç başına bir kez çözülür (önbelleklenir, shutdown'da sıfırlanır) ve tam 32 bayt olmalıdır:

- `env` — `MASTER_ENCRYPTION_KEY` (64 hex karakter). **Yalnız geliştirme**; production başlamayı reddeder.
- `aws` — `AWS_ENCRYPTED_DATA_KEY` (base64 `CiphertextBlob`) AWS KMS ile çözülür (`AWS_REGION`, varsayılan `eu-west-1`). `AWS_KMS_KEY_ARN` kod tarafından okunmaz.
- `vault` — HashiCorp Vault Transit: **sabit wrapped data key** `VAULT_ENCRYPTED_DATA_KEY` (`vault:v1:…`) `transit/decrypt/<VAULT_KEY_NAME>` ile çözülür (`VAULT_ADDR`, `VAULT_TOKEN`; anahtar adı varsayılanı `araf-master-key`). Wrapped key bir kez üretilip saklanmalıdır: her açılışta yeni data key üretmek mevcut tüm PII'ı çözülemez yapardı, bu yüzden değer eksikse fail-closed davranılır.

Production'da açılış self-test'i (`runProductionKmsStartupSelfTest`) provider değişkenlerini kontrol eder ve sunucu dinlemeye başlamadan anahtarı çözer.

### 1.2) Amaç-ayrımlı HMAC (fingerprint ve IP hash'leri)

Wallet'a özel DEK'in yanında aynı master key, HKDF-SHA256 ile amaç-ayrımlı HMAC anahtarları da türetir: salt `sha256("araf-hmac-salt-v1")`, info `"araf-hmac:<purpose>"`, çıktı 32 bayt. Digest `HMAC-SHA256(key, value)` (hex)'dir. Kullanılan amaçlar:

- `payout-fingerprint` — payout profil fingerprint'i (`User.payout_profile.fingerprint.hash`, şema **`hmac-v1`**); payout detaylarının anahtara göre sıralanmış, trim edilmiş JSON'u üzerinden hesaplanır. Girdi wallet'ı içermez; aynı detaylar farklı wallet'larda aynı hash'i verir. Master key olmadan düşük entropili IBAN uzayında brute-force ile geri çözülemez.
- `chargeback-ip` — `POST /api/trades/:id/chargeback-ack` çağıranın IP'si (`chargeback_ack.ip_hash`).

Fingerprint şemaları (`payout_profile.fingerprint.hash_scheme`):

| Şema | Anlamı |
|---|---|
| `hmac-v1` | Güncel. Her yeni/güncellenen profil için yazılır. |
| `sha256` (ya da eksik/`null`) | Eski tuzsuz SHA-256. Yeni kayıtlar için asla yazılmaz; yalnız karşılaştırma yolu olarak korunur (`payoutFingerprintMatches`). |

`PUT /api/auth/profile`, karşılaştırmadan önce **iki tarafı da** (mevcut ve gelen detaylar) HMAC şemasıyla hesaplar; böylece eski `sha256` kaydı, yanlış bir "banka profili değişti" sinyali üretmeden ilk kayıtta `hmac-v1`'e yükselir. Lock anı snapshot'ı yalnız hash'i kopyalar (`payout_snapshot.<role>.fingerprint_hash_at_lock`), şemayı değil; bu yüzden yükseltmeden önce ve sonra alınan snapshot'lar birbiriyle karşılaştırılamaz.

## 2) Etkilenebilecek stored field'lar

HKDF değişikliğinden önce `encryptField(...)` ile şifrelenen her alan migration gerektirebilir:

| Collection / document | Field | Not |
|---|---|---|
| `users` | `payout_profile.payout_details_enc` | Wallet sahibinin şifreli JSON payout detayları. |
| `users` | `payout_profile.contact.value_enc` | Opsiyonel şifreli Telegram/email/phone contact değeri. |
| `trades` | `payout_snapshot.maker.payout_details_enc` | Lock anında kopyalanan maker payout snapshot'ı. |
| `trades` | `payout_snapshot.maker.contact_value_enc` | Opsiyonel şifreli maker contact snapshot'ı. |
| `trades` | `payout_snapshot.taker.payout_details_enc` | Lock anında kopyalanan taker payout snapshot'ı. |
| `trades` | `payout_snapshot.taker.contact_value_enc` | Opsiyonel şifreli taker contact snapshot'ı. |
| `trades` | `evidence.receipt_encrypted` | Şifreli dekont/base64 payload. Trade terminal olduğunda ve `receipt_delete_at` (yüklemeden 30 gün sonrası) geçince retention ile temizlenir. |

`rail`, `country`, fingerprint hash'leri, profile version, timestamp'ler ve bank-change sayaçları gibi şifrelenmemiş metadata bu migration ile yeniden şifrelenmez. Payout snapshot'ları (`payout_snapshot.*`, `fingerprint_hash_at_lock` dahil) trade terminal olduktan sonra kilitten 30 gün sonra retention işi tarafından silinir.

Hash tipi alanlar (`payout_profile.fingerprint.hash`, `payout_snapshot.*.fingerprint_hash_at_lock`, `chargeback_ack.ip_hash`) ciphertext değildir ama master key'e bağlıdır (bölüm 1.2). HKDF DEK değişikliğinden etkilenmezler (o değişiklik yalnız yukarıdaki `*_enc` alanlarına dokunur), fakat master key döndürülürse değişirler.

## 3) Eski payload'ları güvenli tespit etme

Mevcut ciphertext formatında güvenilir byte-level version marker yoktur. Geçerli uzunluktaki bir hex string eski veya yeni olabilir; iki format da AES-256-GCM framing kullanır.

Önce read-only diagnostic yaklaşımı kullanılmalıdır:

1. Doğrudan production üzerinde değil, database snapshot'ı veya staging clone üzerinde çalışın.
2. Sadece record id, owner wallet adresi, field path, ciphertext uzunluğu ve timestamp seçin.
3. Beklenen owner wallet ile **güncel HKDF derivation** kullanarak decrypt deneyin.
4. Authentication failure sonucunu corruption kanıtı değil, `current_hkdf_failed` olarak ele alın.
5. Eski derivation diagnostic'i varsa yalnız staging'de çalıştırın ve sadece aggregate count raporlayın:
   - `current_hkdf_ok`
   - `legacy_derivation_ok`
   - `both_failed`
   - `missing_or_empty`
6. Plaintext, decrypted JSON, dekont içeriği, raw ciphertext, master key, DEK veya KMS response loglamayın.

Gömülü `kdf_version` olmadığı için en güvenli production marker, başarılı re-encryption sonrası eklenmelidir; örneğin collection/id/field bazlı internal migration ledger veya ileride eklenecek `encryption.kdf_version` gibi bir schema alanı. Migration state'i yalnız ciphertext şekline bakarak infer edilmemelidir.

## 4) Staging migration prosedürü

1. **Varsayımları dondurun**
   - Native `crypto.hkdf()` değişikliğini getiren exact commit'i doğrulayın.
   - Staging clone için kullanılan aktif `KMS_PROVIDER` ve master-key material kaynağını doğrulayın.
   - Her etkilenen field için wallet-address ownership kuralını doğrulayın.

2. **Backup ve clone**
   - Production backup/snapshot alın.
   - Production benzeri KMS access control ile staging'e restore edin.
   - Test sırasında PII'yi mutate edebilecek outbound user notification'ları ve job'ları kapatın.

3. **Read-only inventory çalıştırın**
   - Etkilenen field'ları collection ve field path bazında sayın.
   - Empty/null field'ları ayrı sayın.
   - Plaintext yazdırmadan current-HKDF decrypt başarı/başarısızlıklarını sayın.

4. **Write öncesi testli migration tool hazırlayın**
   - İlk versiyon read-only diagnostic olmalıdır.
   - Write mode explicit environment guard, dry-run output ve backup id istemelidir.
   - Unit testler current payload, legacy payload, malformed hex, wrong-wallet decrypt, missing field ve idempotency durumlarını kapsamalıdır.

5. **Staging'de re-encrypt edin**
   - Legacy derivation ile decrypt edilebilen kayıtları memory'de decrypt edip hemen güncel `encryptField(...)` ile yeniden şifreleyin.
   - Plaintext buffer/string'leri mümkün olan en kısa sürede zero/discard edin.
   - Sadece yeni ciphertext ve migration metadata/ledger entry yazın.
   - Plaintext veya raw ciphertext loglamayın.

6. **Staging doğrulaması**
   - Güncel kod tüm migrated field'ları decrypt eder.
   - Migrated scope için legacy-only diagnostic sayısı sıfıra düşer.
   - PII reveal endpoint'leri authorized trade-scoped token ile çalışır.
   - Receipt access/retention davranışı değişmez.
   - Error log ve app log'larında plaintext PII yoktur.

## 5) Rollback planı

- Production verification ve retention window'lar tamamlanana kadar pre-migration database backup'ını saklayın.
- Production'da batch-sized write tercih edin; external migration ledger record id, field path, old ciphertext hash, new ciphertext hash, timestamp ve operator/change id içermelidir. Ciphertext veya plaintext değil, yalnız hash saklayın.
- Traffic açılmadan verification fail ederse database snapshot restore edin veya secure backup sürecinden eski ciphertext değerlerini ledger ile geri yazın.
- Sadece küçük bir batch fail ederse migration'ı durdurun, batch id'lerini quarantine edin, ilgili field'ları backup'tan restore edin ve root cause düzelene kadar app'i pre-migration deployment'ta tutun.
- Bu HKDF migration sırasında master key rotation yapmayın; key rotation için ayrı runbook ve testler hazır olmalıdır. Rotation ayrıca tüm DEK'leri (tüm `*_enc` alanları) ve her `hmac-v1` fingerprint / `ip_hash` değerini geçersiz kılar.

## 6) Production safety checks

Production migration öncesi:

- [ ] Named owner, scheduled window ve rollback owner ile change onaylandı.
- [ ] Backup restore staging'de doğrulandı.
- [ ] Read-only diagnostic yalnız aggregate count üreterek tamamlandı.
- [ ] Migration write mode testlere ve explicit production confirmation guard'a sahip.
- [ ] Production'da `KMS_PROVIDER=env` kullanılmıyor.
- [ ] App, worker ve migration process aynı KMS provider'ı (`vault` için aynı sabit `VAULT_ENCRYPTED_DATA_KEY`; `aws` için aynı `AWS_ENCRYPTED_DATA_KEY`) ve beklenen chain/environment config'i kullanıyor.
- [ ] PII endpoint'leri plaintext loglamadan decrypt/auth failure için monitor ediliyor.
- [ ] Migration öncesi ve sonrası log'larda PII redaction kontrol edildi.
- [ ] Geçici PII reveal erişimsizliği için support/comms planı hazır.

Production migration sonrası:

- [ ] Aggregate count'lar staging beklentileriyle uyumlu.
- [ ] Örnek authorized PII reveal akışları plaintext log olmadan başarılı.
- [ ] Receipt retention cleanup çalışmaya devam ediyor.
- [ ] Migration ledger ve backup retention tarihleri kaydedildi.
