/**
 * Contract revert → kullanıcı dostu mesaj eşlemesi.
 *
 * ArafEscrow custom error kullanır. ABI'da error tanımları yoksa viem revert'i çözemez ve
 * kullanıcı yalnız "execution reverted" görür. Bu modül hem ABI fragment'larını hem de
 * kısa, eyleme dönük TR/EN mesajları tek yerde tutar.
 */

import { APP_LANG_STORAGE_KEY } from './bootstrapState';
import { WALLET_AGE_MIN_DAYS } from './walletAge';

export const ARAF_CONTRACT_ERROR_ABI = [
  'error NotTradeParty()',
  'error InvalidState()',
  'error TakerBanActive()',
  'error MakerBanActive()',
  'error PaymentWindowActive(uint256 expiresAt)',
  'error OnlyMaker()',
  'error OnlyTaker()',
  'error AlreadyRegistered()',
  'error ZeroAmount()',
  'error InvalidTier()',
  'error InvalidListingRef()',
  'error TierNotAllowed()',
  'error AmountExceedsTierLimit()',
  'error SelfTradeForbidden()',
  'error WalletTooYoung()',
  'error InsufficientNativeBalance()',
  'error TierCooldownActive()',
  'error EmptyIpfsHash()',
  'error CannotReleaseInState()',
  'error PingCooldownNotElapsed(uint256 requiredTime)',
  'error AlreadyPinged()',
  'error MustPingFirst()',
  'error ResponseWindowActive()',
  'error BurnPeriodNotReached()',
  'error NoPriorBanHistory()',
  'error CleanPeriodNotElapsed()',
  'error NoBansToReset()',
  'error ConflictingPingPath()',
  'error InvalidSettlementSplit()',
  'error SettlementNotAllowedInState()',
  'error ActiveSettlementProposalExists()',
  'error NoActiveSettlementProposal()',
  'error OnlySettlementProposer()',
  'error OnlySettlementCounterparty()',
  'error SettlementProposalExpired()',
  'error SettlementProposalNotExpired()',
  'error InvalidSettlementDeadline()',
  'error RevenueHookFailed()',
  'error InvalidOrderRef()',
  'error InvalidOrderState()',
  'error OnlyOrderOwner()',
  'error FillAmountExceedsRemaining()',
  'error FillAmountBelowMinimum()',
  'error InvalidMinFill()',
  'error OrderSideMismatch()',
  'error TokenDirectionNotAllowed()',
  'error InvalidTransferAmount()',
  'error EnforcedPause()',
  // ArafRewards / ArafRevenueVault
  'error RecordingWindowClosed()',
  'error RecordingWindowOpen()',
  'error EpochTokenNotFinalized()',
  'error ClaimDelayActive()',
  'error ClaimWindowClosed()',
  'error ZeroUserWeight()',
  'error AlreadyClaimed()',
  'error StaleTargetEpoch()',
  'error ReentrancyGuardReentrantCall()',
  'error SafeERC20FailedOperation(address token)',
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
];

const MESSAGES = {
  NotTradeParty: { TR: 'Bu işlemin tarafı değilsiniz.', EN: 'You are not a party to this trade.' },
  InvalidState: { TR: 'İşlem bu adım için uygun durumda değil. Sayfayı yenileyin.', EN: 'Trade is not in the right state. Refresh the page.' },
  CannotReleaseInState: { TR: 'İşlem bu adım için uygun durumda değil. Sayfayı yenileyin.', EN: 'Trade is not in the right state. Refresh the page.' },
  TakerBanActive: { TR: 'Alıcı kısıtlamanız aktif.', EN: 'Your taker restriction is active.' },
  MakerBanActive: { TR: 'Kısıtlamanız aktif; şu an emir açamazsınız.', EN: 'Your restriction is active; you cannot open orders now.' },
  PaymentWindowActive: { TR: '48 saatlik ödeme süresi henüz dolmadı.', EN: 'The 48h payment window is still open.' },
  RecordingWindowClosed: { TR: 'Bu dönemin kayıt süresi kapandı.', EN: 'Recording window for this epoch is closed.' },
  RecordingWindowOpen: { TR: 'Dönem kaydı hâlâ açık; biraz sonra deneyin.', EN: 'Epoch recording is still open; try later.' },
  EpochTokenNotFinalized: { TR: 'Dönem henüz kapanmadı.', EN: 'Epoch is not finalized yet.' },
  ClaimDelayActive: { TR: 'Talep süresi henüz açılmadı.', EN: 'Claims are not open yet.' },
  ClaimWindowClosed: { TR: 'Talep süresi doldu.', EN: 'Claim window closed.' },
  ZeroUserWeight: { TR: 'Bu dönemde ödül ağırlığınız yok.', EN: 'You have no reward weight in this epoch.' },
  AlreadyClaimed: { TR: 'Bu ödülü zaten aldınız.', EN: 'Already claimed.' },
  StaleTargetEpoch: { TR: 'Geçmiş bir döneme fon gönderilemez.', EN: 'Cannot fund a past epoch.' },
  OnlyMaker: { TR: 'Bu adımı yalnızca satıcı (maker) yapabilir.', EN: 'Only the maker can do this.' },
  OnlyTaker: { TR: 'Bu adımı yalnızca alıcı (taker) yapabilir.', EN: 'Only the taker can do this.' },
  AlreadyRegistered: { TR: 'Cüzdan zaten kayıtlı.', EN: 'Wallet already registered.' },
  ZeroAmount: { TR: 'Tutar sıfır olamaz.', EN: 'Amount cannot be zero.' },
  TierNotAllowed: { TR: 'Bu tier için seviyeniz yetersiz.', EN: 'Your tier is too low for this order.' },
  AmountExceedsTierLimit: { TR: 'Tutar tier limitini aşıyor.', EN: 'Amount exceeds the tier limit.' },
  SelfTradeForbidden: { TR: 'Kendi emrinizi dolduramazsınız.', EN: 'You cannot fill your own order.' },
  WalletTooYoung: { TR: `Cüzdanınız kayıttan sonra ${WALLET_AGE_MIN_DAYS} gün beklemeli.`, EN: `Your wallet must be registered for ${WALLET_AGE_MIN_DAYS} days.` },
  InsufficientNativeBalance: { TR: 'Cüzdanda en az 0.001 ETH olmalı.', EN: 'Keep at least 0.001 ETH in your wallet.' },
  TierCooldownActive: { TR: 'Bekleme süresi dolmadı. Biraz sonra tekrar deneyin.', EN: 'Cooldown active. Try again later.' },
  EmptyIpfsHash: { TR: 'Önce dekont yükleyin.', EN: 'Upload a receipt first.' },
  PingCooldownNotElapsed: { TR: 'Uyarı süresi henüz dolmadı.', EN: 'Ping window has not opened yet.' },
  AlreadyPinged: { TR: 'Uyarı zaten gönderildi.', EN: 'Already pinged.' },
  MustPingFirst: { TR: 'Önce karşı tarafı uyarmalısınız.', EN: 'You must ping first.' },
  ResponseWindowActive: { TR: 'Karşı tarafın 24 saatlik yanıt süresi devam ediyor.', EN: 'The 24h response window is still open.' },
  ConflictingPingPath: { TR: 'Karşı taraf farklı bir uyarı yolu başlattı; bu adım artık kullanılamaz.', EN: 'Counterparty started another ping path; this action is no longer available.' },
  BurnPeriodNotReached: { TR: '10 günlük süre henüz dolmadı.', EN: 'The 10-day window has not passed yet.' },
  NoPriorBanHistory: { TR: 'Temizlenecek ceza geçmişi yok.', EN: 'No ban history to clear.' },
  CleanPeriodNotElapsed: { TR: 'Temiz sayfa süresi henüz dolmadı.', EN: 'Clean-slate period has not passed yet.' },
  NoBansToReset: { TR: 'Sıfırlanacak ceza yok.', EN: 'No bans to reset.' },
  SettlementNotAllowedInState: { TR: 'Uzlaşma yalnızca itiraz sürecinde yapılabilir.', EN: 'Settlement is only available during a dispute.' },
  ActiveSettlementProposalExists: { TR: 'Zaten aktif bir uzlaşma teklifi var.', EN: 'A settlement proposal is already active.' },
  NoActiveSettlementProposal: { TR: 'Aktif uzlaşma teklifi yok.', EN: 'No active settlement proposal.' },
  OnlySettlementProposer: { TR: 'Teklifi yalnızca teklif eden geri çekebilir.', EN: 'Only the proposer can withdraw.' },
  OnlySettlementCounterparty: { TR: 'Teklifi yalnızca karşı taraf yanıtlayabilir.', EN: 'Only the counterparty can respond.' },
  SettlementProposalExpired: { TR: 'Teklifin süresi doldu.', EN: 'Proposal expired.' },
  SettlementProposalNotExpired: { TR: 'Teklifin süresi henüz dolmadı.', EN: 'Proposal has not expired yet.' },
  InvalidSettlementDeadline: { TR: 'Geçersiz teklif süresi (10 dk – 7 gün).', EN: 'Invalid proposal expiry (10 min – 7 days).' },
  InvalidSettlementSplit: { TR: 'Geçersiz paylaşım oranı.', EN: 'Invalid split ratio.' },
  RevenueHookFailed: { TR: 'Protokol hazinesi şu an işlemi kabul etmiyor. Daha sonra deneyin.', EN: 'Protocol treasury rejected the transfer. Try later.' },
  InvalidOrderState: { TR: 'Emir artık aktif değil. Listeyi yenileyin.', EN: 'Order is no longer active. Refresh the list.' },
  OnlyOrderOwner: { TR: 'Bu emir size ait değil.', EN: 'This order is not yours.' },
  FillAmountExceedsRemaining: { TR: 'Tutar emirde kalan miktarı aşıyor.', EN: 'Amount exceeds the remaining order size.' },
  FillAmountBelowMinimum: { TR: 'Tutar emrin minimum limitinin altında.', EN: 'Amount is below the order minimum.' },
  InvalidMinFill: { TR: 'Minimum limit toplam tutardan büyük olamaz.', EN: 'Minimum cannot exceed the total amount.' },
  TokenDirectionNotAllowed: { TR: 'Bu token bu emir yönü için kapalı.', EN: 'This token is disabled for this order side.' },
  InvalidTransferAmount: { TR: 'Transfer ücreti kesen tokenlar desteklenmez.', EN: 'Fee-on-transfer tokens are not supported.' },
  OrderSideMismatch: { TR: 'Emir türü uyuşmuyor. Listeyi yenileyin.', EN: 'Order side mismatch. Refresh the list.' },
  InvalidOrderRef: { TR: 'Emir referansı geçersiz. Tekrar deneyin.', EN: 'Invalid order reference. Try again.' },
  InvalidListingRef: { TR: 'İşlem referansı geçersiz. Tekrar deneyin.', EN: 'Invalid trade reference. Try again.' },
  InvalidTier: { TR: 'Geçersiz tier seçimi.', EN: 'Invalid tier.' },
  OwnableUnauthorizedAccount: { TR: 'Bu işlem yalnız yöneticiye açık.', EN: 'Admin-only action.' },
  EnforcedPause: { TR: 'Protokol bakımda. Yeni işlem açılamaz.', EN: 'Protocol is paused. New trades are disabled.' },
  ERC20InsufficientBalance: { TR: 'Token bakiyeniz yetersiz.', EN: 'Insufficient token balance.' },
  ERC20InsufficientAllowance: { TR: 'Token izni yetersiz. Tekrar deneyin.', EN: 'Insufficient token allowance. Try again.' },
  SafeERC20FailedOperation: { TR: 'Token transferi başarısız.', EN: 'Token transfer failed.' },
};

const readLang = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(APP_LANG_STORAGE_KEY) === 'TR' ? 'TR' : 'EN';
  } catch {
    return 'EN';
  }
};

/**
 * [TR] viem hata zincirinden custom error adını çıkarır.
 * [EN] Extracts the custom error name from a viem error chain.
 */
export const extractContractErrorName = (error) => {
  if (!error) return null;
  const visit = typeof error.walk === 'function' ? error.walk((e) => Boolean(e?.data?.errorName)) : null;
  const fromWalk = visit?.data?.errorName || error?.data?.errorName || error?.cause?.data?.errorName;
  if (fromWalk) return fromWalk;
  const raw = `${error?.shortMessage || ''} ${error?.message || ''}`;
  const match = Object.keys(MESSAGES).find((name) => raw.includes(name));
  return match || null;
};

export const describeContractErrorName = (name, lang = readLang()) => {
  const row = MESSAGES[name];
  if (!row) return null;
  return row[lang === 'TR' ? 'TR' : 'EN'];
};

/**
 * [TR] Hatayı yerinde zenginleştirir: arafErrorName + okunabilir shortMessage.
 * [EN] Enriches the error in place with arafErrorName + a readable shortMessage.
 */
export const decorateContractError = (error, lang = readLang()) => {
  const name = extractContractErrorName(error);
  if (!name || !error || typeof error !== 'object') return error;
  const friendly = describeContractErrorName(name, lang);
  try {
    error.arafErrorName = name;
    if (friendly) error.shortMessage = friendly;
  } catch {
    // frozen error object — leave untouched
  }
  return error;
};
