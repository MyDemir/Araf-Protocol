// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  ArafEscrow
 * @notice Oracle kullanmayan, P2P itibari para ↔ kripto takas kontratı. 
 * Zamanla eriyen (Bleeding Escrow) anlaşmazlık çözüm mekanizması içerir.
 */

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ═══════════════════════════════════════════════════
//  ÖZEL HATALAR (Custom Errors - Gaz Optimizasyonu için)
// ═══════════════════════════════════════════════════
error NotTradeParty();
error InvalidState();
error TakerBanActive();
error OnlyMaker();
error OnlyTaker();
error AlreadyRegistered();
error TokenNotSupported();
error ZeroAmount();
error InvalidTier();
error TierNotAllowed();
error AmountExceedsTierLimit(); // C-04: Tier limit aşımı hatası
error SelfTradeForbidden();
error WalletTooYoung();
error InsufficientNativeBalance();
error TierCooldownActive();
error EmptyIpfsHash();
error CannotReleaseInState();
error PingCooldownNotElapsed(uint256 requiredTime);
error AlreadyPinged();
error MustPingFirst();
error ResponseWindowActive();
error SignatureExpired();
error InvalidSignature();
error BurnPeriodNotReached();
error NoPriorBanHistory();
error CleanPeriodNotElapsed();
error NoBansToReset();
error DeadlineTooFar();
error ConflictingPingPath();

contract ArafEscrow is ReentrancyGuard, EIP712, Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════
    //  VERİ YAPILARI (Enums & Structs)
    // ═══════════════════════════════════════════════════

    // İşlem durumları
    enum TradeState { OPEN, LOCKED, PAID, CHALLENGED, RESOLVED, CANCELED, BURNED }

    // Ana işlem yapısı
    struct Trade {
        uint256 id;
        address maker;
        address taker;
        address tokenAddress;
        uint256 cryptoAmount;
        uint256 makerBond; // Maker teminatı
        uint256 takerBond; // Taker teminatı
        uint8   tier;      // İşlem seviyesi (0-4)
        TradeState state;
        uint256 lockedAt;
        uint256 paidAt;
        uint256 challengedAt;
        string  ipfsReceiptHash; // Dekont IPFS adresi
        bool    cancelProposedByMaker;
        bool    cancelProposedByTaker;
        uint256 pingedAt;
        bool    pingedByTaker;
        uint256 challengePingedAt;
        bool    challengePingedByMaker;
    }

    // Kullanıcı itibar ve ceza durumu
    struct Reputation {
        uint256 successfulTrades;
        uint256 failedDisputes;
        uint256 bannedUntil;
        uint256 consecutiveBans;
    }

    // ═══════════════════════════════════════════════════
    //  SABİTLER (Constants)
    // ═══════════════════════════════════════════════════

    // Tier'lara göre teminat oranları (BPS: 100 = %1)
    uint256 public constant MAKER_BOND_TIER0_BPS = 0;
    uint256 public constant MAKER_BOND_TIER1_BPS = 800;
    uint256 public constant MAKER_BOND_TIER2_BPS = 600;
    uint256 public constant MAKER_BOND_TIER3_BPS = 500;
    uint256 public constant MAKER_BOND_TIER4_BPS = 200;

    uint256 public constant TAKER_BOND_TIER0_BPS = 0;
    uint256 public constant TAKER_BOND_TIER1_BPS = 1000;
    uint256 public constant TAKER_BOND_TIER2_BPS = 800;
    uint256 public constant TAKER_BOND_TIER3_BPS = 500;
    uint256 public constant TAKER_BOND_TIER4_BPS = 200;

    // Tier başına düşen maksimum kripto limitleri (6 decimal - USDT/USDC)
    uint256 public constant TIER_MAX_AMOUNT_TIER0 =    150 * 10**6;
    uint256 public constant TIER_MAX_AMOUNT_TIER1 =   1500 * 10**6;
    uint256 public constant TIER_MAX_AMOUNT_TIER2 =   7500 * 10**6;
    uint256 public constant TIER_MAX_AMOUNT_TIER3 =  30000 * 10**6;

    // Protokol kesintileri ve itibar çarpanları
    uint256 public constant GOOD_REP_DISCOUNT_BPS = 100; // İyi itibar indirimi (-%1)
    uint256 public constant BAD_REP_PENALTY_BPS   = 300; // Kötü itibar cezası (+%3)
    uint256 public constant TAKER_FEE_BPS = 10;          // %0.1 protokol kesintisi
    uint256 public constant MAKER_FEE_BPS = 10;          // %0.1 protokol kesintisi
    uint256 public constant AUTO_RELEASE_PENALTY_BPS = 200; // İhmal cezası (%2)

    // Zamanlayıcılar (Timers)
    uint256 public constant GRACE_PERIOD         =  48 hours; // İtiraz sonrası cezasız pencere
    uint256 public constant USDT_DECAY_START     =  96 hours; // Kripto varlık erime başlangıcı
    uint256 public constant MAX_BLEEDING         = 240 hours; // Maksimum erime süresi (10 Gün)
    uint256 public constant WALLET_AGE_MIN       =   7 days;  // Sybil koruması cüzdan yaşı
    uint256 public constant TIER0_TRADE_COOLDOWN =  4 hours;
    uint256 public constant TIER1_TRADE_COOLDOWN =  4 hours;
    uint256 public constant MAX_CANCEL_DEADLINE  =   7 days;
    uint256 public constant MIN_ACTIVE_PERIOD    =  15 days;

    // Saatlik erime oranları (BPS cinsinden)
    uint256 public constant TAKER_BOND_DECAY_BPS_H = 42;
    uint256 public constant MAKER_BOND_DECAY_BPS_H = 26;
    uint256 public constant CRYPTO_DECAY_BPS_H     = 34;

    // Anti-Sybil limitleri
    uint256 public constant DUST_LIMIT = 0.001 ether;
    uint256 private constant BPS_DENOMINATOR  = 10_000;
    uint256 private constant SECONDS_PER_HOUR = 3_600;

    bytes32 private constant CANCEL_TYPEHASH = keccak256(
        "CancelProposal(uint256 tradeId,address proposer,uint256 nonce,uint256 deadline)"
    );

    // ═══════════════════════════════════════════════════
    //  DURUM DEĞİŞKENLERİ (State Variables)
    // ═══════════════════════════════════════════════════

    uint256 public tradeCounter;
    address public treasury;

    mapping(uint256 => Trade) public trades;
    mapping(address => Reputation) public reputation;
    mapping(address => uint256) public walletRegisteredAt;
    mapping(address => uint256) public lastTradeAt;
    mapping(address => uint8) public maxAllowedTier; // Kullanıcının ceza nedeniyle düşürüldüğü max tier
    mapping(address => bool)  public hasTierPenalty; // Hiç tier cezası aldı mı kontrolü
    mapping(address => uint256) public firstSuccessfulTradeAt; // İlk başarılı işlem tarihi (Wash trade önlemi)
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public sigNonces;

    // ═══════════════════════════════════════════════════
    //  OLAYLAR (Events)
    // ═══════════════════════════════════════════════════

    event WalletRegistered(address indexed wallet, uint256 timestamp);
    event EscrowCreated(uint256 indexed tradeId, address indexed maker, address token, uint256 amount, uint8 tier);
    event EscrowLocked(uint256 indexed tradeId, address indexed taker, uint256 takerBond);
    event PaymentReported(uint256 indexed tradeId, string ipfsHash, uint256 timestamp);
    event EscrowReleased(uint256 indexed tradeId, address indexed maker, address indexed taker, uint256 takerFee, uint256 makerFee);
    event DisputeOpened(uint256 indexed tradeId, address indexed challenger, uint256 timestamp);
    event CancelProposed(uint256 indexed tradeId, address indexed proposer);
    event EscrowCanceled(uint256 indexed tradeId, uint256 makerRefund, uint256 takerRefund);
    event MakerPinged(uint256 indexed tradeId, address indexed pinger, uint256 timestamp);
    event BleedingDecayed(uint256 indexed tradeId, uint256 decayedAmount, uint256 timestamp);
    event EscrowBurned(uint256 indexed tradeId, uint256 burnedAmount);
    event ReputationUpdated(address indexed wallet, uint256 successful, uint256 failed, uint256 bannedUntil, uint8 effectiveTier);
    event TreasuryUpdated(address indexed newTreasury);
    event TokenSupportUpdated(address indexed token, bool supported);

    // ═══════════════════════════════════════════════════
    //  MODIFIER'LAR
    // ═══════════════════════════════════════════════════

    modifier inState(uint256 _tradeId, TradeState _expected) {
        if (trades[_tradeId].state != _expected) revert InvalidState();
        _;
    }

    modifier notBanned() {
        Reputation storage rep = reputation[msg.sender];
        if (rep.bannedUntil != 0 && block.timestamp <= rep.bannedUntil) revert TakerBanActive();
        _;
    }

    constructor(address _treasury) EIP712("ArafEscrow", "1") Ownable(msg.sender) {
        if (_treasury == address(0)) revert OwnableInvalidOwner(address(0));
        treasury = _treasury;
    }

    // ═══════════════════════════════════════════════════
    //  DIŞ FONKSİYONLAR (External Functions)
    // ═══════════════════════════════════════════════════

    /**
     * @notice Cüzdanı kaydeder ve 7 günlük yaşlanma sürecini başlatır (Anti-Sybil).
     */
    function registerWallet() external {
        if (walletRegisteredAt[msg.sender] != 0) revert AlreadyRegistered();
        walletRegisteredAt[msg.sender] = block.timestamp;
        emit WalletRegistered(msg.sender, block.timestamp);
    }

    /**
     * @notice Maker yeni bir ilan oluşturur. Kripto varlık ve teminatı kilitlenir.
     * @param _token ERC20 Token adresi (örn. USDT)
     * @param _cryptoAmount Satılacak miktar
     * @param _tier İşlem seviyesi (0-4)
     */
    function createEscrow(address _token, uint256 _cryptoAmount, uint8 _tier) external nonReentrant whenNotPaused returns (uint256 tradeId) {
        if (!supportedTokens[_token]) revert TokenNotSupported();
        if (_cryptoAmount == 0) revert ZeroAmount();
        if (_tier > 4) revert InvalidTier();

        uint8 effectiveTier = _getEffectiveTier(msg.sender);
        if (_tier > effectiveTier) revert TierNotAllowed();

        // Tier limitlerini on-chain zorunlu kıl (C-04 Fix)
        uint256 tierMax = _getTierMaxAmount(_tier);
        if (tierMax > 0 && _cryptoAmount > tierMax) revert AmountExceedsTierLimit();

        uint256 bondBps = _getMakerBondBps(msg.sender, _tier);
        uint256 makerBond = (_cryptoAmount * bondBps) / BPS_DENOMINATOR;
        uint256 totalLock = _cryptoAmount + makerBond;

        tradeId = ++tradeCounter;
        trades[tradeId] = Trade({
            id: tradeId, maker: msg.sender, taker: address(0), tokenAddress: _token,
            cryptoAmount: _cryptoAmount, makerBond: makerBond, takerBond: 0, tier: _tier,
            state: TradeState.OPEN, ipfsReceiptHash: "", lockedAt: 0, paidAt: 0,
            challengedAt: 0, cancelProposedByMaker: false, cancelProposedByTaker: false,
            pingedAt: 0, pingedByTaker: false, challengePingedAt: 0, challengePingedByMaker: false
        });

        IERC20(_token).safeTransferFrom(msg.sender, address(this), totalLock);
        emit EscrowCreated(tradeId, msg.sender, _token, _cryptoAmount, _tier);
    }

    /**
     * @notice Eşleşmemiş (OPEN) bir ilanı iptal eder. Fonlar Maker'a iade edilir.
     */
    function cancelOpenEscrow(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.OPEN) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.maker) revert OnlyMaker();

        uint256 refundAmount = t.cryptoAmount + t.makerBond;
        t.state = TradeState.CANCELED;

        IERC20(t.tokenAddress).safeTransfer(t.maker, refundAmount);
        emit EscrowCanceled(_tradeId, refundAmount, 0);
    }

    /**
     * @notice Taker ilanı kabul eder ve kendi teminatını kilitler. Anti-Sybil kontrolleri çalışır.
     */
    function lockEscrow(uint256 _tradeId) external nonReentrant notBanned whenNotPaused inState(_tradeId, TradeState.OPEN) {
        Trade storage t = trades[_tradeId];
        
        if (msg.sender == t.maker) revert SelfTradeForbidden();
        if (walletRegisteredAt[msg.sender] == 0 || block.timestamp < walletRegisteredAt[msg.sender] + WALLET_AGE_MIN) revert WalletTooYoung();
        if (msg.sender.balance < DUST_LIMIT) revert InsufficientNativeBalance();
        if (t.tier == 0 || t.tier == 1) {
            if (lastTradeAt[msg.sender] != 0 && block.timestamp < lastTradeAt[msg.sender] + TIER0_TRADE_COOLDOWN) revert TierCooldownActive();
        }

        uint8 takerEffectiveTier = _getEffectiveTier(msg.sender);
        if (t.tier > takerEffectiveTier) revert TierNotAllowed();

        uint256 takerBondBps = _getTakerBondBps(msg.sender, t.tier);
        uint256 takerBond = (t.cryptoAmount * takerBondBps) / BPS_DENOMINATOR;

        t.taker = msg.sender;
        t.takerBond = takerBond;
        t.state = TradeState.LOCKED;
        t.lockedAt = block.timestamp;
        lastTradeAt[msg.sender] = block.timestamp;

        if (takerBond > 0) IERC20(t.tokenAddress).safeTransferFrom(msg.sender, address(this), takerBond);
        emit EscrowLocked(_tradeId, msg.sender, takerBond);
    }

    /**
     * @notice Taker, fiat ödemeyi yaptığını bildirir (dekont hash'i ile). 48 saatlik bekleme başlar.
     */
    function reportPayment(uint256 _tradeId, string calldata _ipfsHash) external nonReentrant inState(_tradeId, TradeState.LOCKED) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.taker) revert OnlyTaker();
        if (bytes(_ipfsHash).length == 0) revert EmptyIpfsHash();

        t.state = TradeState.PAID;
        t.paidAt = block.timestamp;
        t.ipfsReceiptHash = _ipfsHash;
        emit PaymentReported(_tradeId, _ipfsHash, block.timestamp);
    }

    /**
     * @notice Maker ödemeyi onaylar ve fonları Taker'a serbest bırakır.
     */
    function releaseFunds(uint256 _tradeId) external nonReentrant {
        Trade storage t = trades[_tradeId];
        if (t.state != TradeState.PAID && t.state != TradeState.CHALLENGED) revert CannotReleaseInState();
        if (msg.sender != t.maker) revert OnlyMaker();

        (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond, uint256 decayed) = _calculateCurrentAmounts(_tradeId);
        bool makerOpenedDispute = (t.state == TradeState.CHALLENGED);

        t.state = TradeState.RESOLVED;

        if (decayed > 0) {
            IERC20(t.tokenAddress).safeTransfer(treasury, decayed);
            emit BleedingDecayed(_tradeId, decayed, block.timestamp);
        }

        uint256 takerFee = (currentCrypto * TAKER_FEE_BPS) / BPS_DENOMINATOR;
        uint256 takerReceives = currentCrypto - takerFee;

        uint256 makerFee = (currentCrypto * MAKER_FEE_BPS) / BPS_DENOMINATOR;
        uint256 makerBondAfterFee = currentMakerBond > makerFee ? currentMakerBond - makerFee : 0;
        uint256 actualMakerFee = currentMakerBond > makerFee ? makerFee : currentMakerBond;

        IERC20(t.tokenAddress).safeTransfer(t.taker, takerReceives);
        
        if (takerFee + actualMakerFee > 0) IERC20(t.tokenAddress).safeTransfer(treasury, takerFee + actualMakerFee);
        if (makerBondAfterFee > 0) IERC20(t.tokenAddress).safeTransfer(t.maker, makerBondAfterFee);
        if (currentTakerBond > 0) IERC20(t.tokenAddress).safeTransfer(t.taker, currentTakerBond);

        _updateReputation(t.maker, makerOpenedDispute);
        _updateReputation(t.taker, false);

        emit EscrowReleased(_tradeId, t.maker, t.taker, takerFee, actualMakerFee);
    }

    /**
     * @notice Maker, ödeme gelmediyse itirazdan (challenge) 24 saat önce Taker'ı uyarır.
     */
    function pingTakerForChallenge(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.PAID) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.maker) revert OnlyMaker();
        if (block.timestamp < t.paidAt + 24 hours) revert PingCooldownNotElapsed(t.paidAt + 24 hours);
        if (t.challengePingedByMaker) revert AlreadyPinged();
        if (t.pingedByTaker) revert ConflictingPingPath();

        t.challengePingedByMaker = true;
        t.challengePingedAt = block.timestamp;
        emit MakerPinged(_tradeId, msg.sender, block.timestamp);
    }

    /**
     * @notice Maker itiraz sürecini (Dispute) başlatır. Bleeding Escrow penceresi açılır.
     */
    function challengeTrade(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.PAID) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.maker) revert OnlyMaker();
        if (!t.challengePingedByMaker) revert MustPingFirst();
        if (block.timestamp < t.challengePingedAt + 24 hours) revert ResponseWindowActive();

        t.state = TradeState.CHALLENGED;
        t.challengedAt = block.timestamp;
        emit DisputeOpened(_tradeId, msg.sender, block.timestamp);
    }

    /**
     * @notice EIP-712 imzası kullanarak karşılıklı iptal teklifi sunar veya onaylar.
     */
    function proposeOrApproveCancel(uint256 _tradeId, uint256 _deadline, bytes calldata _sig) external nonReentrant {
        Trade storage t = trades[_tradeId];
        if (t.state != TradeState.LOCKED && t.state != TradeState.PAID && t.state != TradeState.CHALLENGED) revert CannotReleaseInState();
        if (block.timestamp > _deadline) revert SignatureExpired();
        if (msg.sender != t.maker && msg.sender != t.taker) revert NotTradeParty();
        if (_deadline > block.timestamp + MAX_CANCEL_DEADLINE) revert DeadlineTooFar();

        bytes32 structHash = keccak256(abi.encode(CANCEL_TYPEHASH, _tradeId, msg.sender, sigNonces[msg.sender], _deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, _sig);
        
        if (recovered != msg.sender) revert InvalidSignature();

        sigNonces[msg.sender]++;
        
        if (msg.sender == t.maker) t.cancelProposedByMaker = true;
        else t.cancelProposedByTaker = true;
        
        emit CancelProposed(_tradeId, msg.sender);
        
        if (t.cancelProposedByMaker && t.cancelProposedByTaker) {
            _executeCancel(_tradeId);
        }
    }

    /**
     * @notice 10 günlük erime (bleeding) süresi dolduğunda işlemi yakar. Kalan fonlar hazineye gider.
     */
    function burnExpired(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.CHALLENGED) {
        Trade storage t = trades[_tradeId];
        if (block.timestamp < t.challengedAt + MAX_BLEEDING) revert BurnPeriodNotReached();

        (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond,) = _calculateCurrentAmounts(_tradeId);
        uint256 totalBurn = currentCrypto + currentMakerBond + currentTakerBond;

        t.state = TradeState.BURNED;
        if (totalBurn > 0) IERC20(t.tokenAddress).safeTransfer(treasury, totalBurn);

        _updateReputation(t.maker, true);
        _updateReputation(t.taker, true);

        emit EscrowBurned(_tradeId, totalBurn);
    }

    /**
     * @notice Taker, ödeme bildiriminden 48 saat sonra pasif kalan Maker'a uyanma sinyali gönderir.
     */
    function pingMaker(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.PAID) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.taker) revert OnlyTaker();
        if (block.timestamp < t.paidAt + GRACE_PERIOD) revert PingCooldownNotElapsed(t.paidAt + GRACE_PERIOD);
        if (t.pingedByTaker) revert AlreadyPinged();
        if (t.challengePingedByMaker) revert ConflictingPingPath();

        t.pingedByTaker = true;
        t.pingedAt = block.timestamp;
        emit MakerPinged(_tradeId, msg.sender, block.timestamp);
    }

    /**
     * @notice Maker ping'e 24 saat yanıt vermezse, Taker fonları otomatik serbest bırakır. İki taraf da ceza öder.
     */
    function autoRelease(uint256 _tradeId) external nonReentrant inState(_tradeId, TradeState.PAID) {
        Trade storage t = trades[_tradeId];
        if (msg.sender != t.taker) revert OnlyTaker();
        if (!t.pingedByTaker) revert MustPingFirst();
        if (block.timestamp < t.pingedAt + 24 hours) revert ResponseWindowActive();

        (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond, uint256 decayed) = _calculateCurrentAmounts(_tradeId);
        t.state = TradeState.RESOLVED;

        if (decayed > 0) {
            IERC20(t.tokenAddress).safeTransfer(treasury, decayed);
            emit BleedingDecayed(_tradeId, decayed, block.timestamp);
        }

        uint256 makerPenalty = (currentMakerBond * AUTO_RELEASE_PENALTY_BPS) / BPS_DENOMINATOR;
        uint256 takerPenalty = (currentTakerBond * AUTO_RELEASE_PENALTY_BPS) / BPS_DENOMINATOR;

        uint256 makerReceives = currentMakerBond - makerPenalty;
        uint256 takerReceivesBond = currentTakerBond - takerPenalty;
        uint256 totalPenalty = makerPenalty + takerPenalty;

        IERC20(t.tokenAddress).safeTransfer(t.taker, currentCrypto);
        if (makerReceives > 0) IERC20(t.tokenAddress).safeTransfer(t.maker, makerReceives);
        if (takerReceivesBond > 0) IERC20(t.tokenAddress).safeTransfer(t.taker, takerReceivesBond);
        if (totalPenalty > 0) IERC20(t.tokenAddress).safeTransfer(treasury, totalPenalty);

        _updateReputation(t.maker, true);
        _updateReputation(t.taker, false);

        emit EscrowReleased(_tradeId, t.maker, t.taker, makerPenalty, takerPenalty);
    }

    /**
     * @notice 180 gün sorunsuz geçen kullanıcının art arda ceza sayacını sıfırlar.
     */
    function decayReputation(address _wallet) external nonReentrant {
        Reputation storage rep = reputation[_wallet];
        if (rep.bannedUntil == 0) revert NoPriorBanHistory();
        if (block.timestamp <= rep.bannedUntil + 180 days) revert CleanPeriodNotElapsed();
        if (rep.consecutiveBans == 0) revert NoBansToReset();

        rep.consecutiveBans = 0;
        emit ReputationUpdated(_wallet, rep.successfulTrades, rep.failedDisputes, rep.bannedUntil, _getEffectiveTier(_wallet));
    }

    // ═══════════════════════════════════════════════════
    //  İÇ VE GÖRÜNÜM FONKSİYONLARI (Internal / View)
    // ═══════════════════════════════════════════════════

    /**
     * @dev Karşılıklı iptal işlemini yürütür ve iadeleri hesaplar.
     */
    function _executeCancel(uint256 _tradeId) internal {
        Trade storage t = trades[_tradeId];
        TradeState currentState = t.state;

        (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond, uint256 decayed) = _calculateCurrentAmounts(_tradeId);
        t.state = TradeState.CANCELED;

        if (decayed > 0) {
            IERC20(t.tokenAddress).safeTransfer(treasury, decayed);
            emit BleedingDecayed(_tradeId, decayed, block.timestamp);
        }

        uint256 takerFee = 0;
        uint256 makerFee = 0;

        if (currentState == TradeState.PAID || currentState == TradeState.CHALLENGED) {
            takerFee = (currentCrypto * TAKER_FEE_BPS) / BPS_DENOMINATOR;
            makerFee = (currentCrypto * MAKER_FEE_BPS) / BPS_DENOMINATOR;
        }

        uint256 totalFeeToTreasury = 0;
        uint256 makerRefund;
        uint256 takerRefund;

        if (currentMakerBond >= makerFee) {
            makerRefund = currentCrypto + (currentMakerBond - makerFee);
            totalFeeToTreasury += makerFee;
        } else {
            makerRefund = currentCrypto;
            totalFeeToTreasury += currentMakerBond;
        }

        if (currentTakerBond >= takerFee) {
            takerRefund = currentTakerBond - takerFee;
            totalFeeToTreasury += takerFee;
        } else {
            takerRefund = 0;
            totalFeeToTreasury += currentTakerBond;
        }

        if (totalFeeToTreasury > 0) IERC20(t.tokenAddress).safeTransfer(treasury, totalFeeToTreasury);
        if (makerRefund > 0) IERC20(t.tokenAddress).safeTransfer(t.maker, makerRefund);
        if (takerRefund > 0) IERC20(t.tokenAddress).safeTransfer(t.taker, takerRefund);

        emit EscrowCanceled(_tradeId, makerRefund, takerRefund);
    }

    /**
     * @dev Bleeding Escrow sistemine göre saniye bazlı güncel fon miktarını hesaplar.
     */
    function _calculateCurrentAmounts(uint256 _tradeId) internal view returns (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond, uint256 totalDecayed) {
        Trade storage t = trades[_tradeId];
        if (t.state != TradeState.CHALLENGED || t.challengedAt == 0) return (t.cryptoAmount, t.makerBond, t.takerBond, 0);

        uint256 elapsed = block.timestamp - t.challengedAt;
        if (elapsed > MAX_BLEEDING) elapsed = MAX_BLEEDING;

        uint256 bleedingElapsed = elapsed > GRACE_PERIOD ? elapsed - GRACE_PERIOD : 0;
        uint256 makerBondDecayed = (t.makerBond * MAKER_BOND_DECAY_BPS_H * bleedingElapsed) / (BPS_DENOMINATOR * SECONDS_PER_HOUR);
        if (makerBondDecayed > t.makerBond) makerBondDecayed = t.makerBond;

        uint256 takerBondDecayed = (t.takerBond * TAKER_BOND_DECAY_BPS_H * bleedingElapsed) / (BPS_DENOMINATOR * SECONDS_PER_HOUR);
        if (takerBondDecayed > t.takerBond) takerBondDecayed = t.takerBond;

        currentMakerBond = t.makerBond - makerBondDecayed;
        currentTakerBond = t.takerBond - takerBondDecayed;

        uint256 cryptoDecayed = 0;
        if (bleedingElapsed > USDT_DECAY_START) {
            uint256 usdtElapsed = bleedingElapsed - USDT_DECAY_START;
            cryptoDecayed = (t.cryptoAmount * CRYPTO_DECAY_BPS_H * 2 * usdtElapsed) / (BPS_DENOMINATOR * SECONDS_PER_HOUR);
            if (cryptoDecayed > t.cryptoAmount) cryptoDecayed = t.cryptoAmount;
        }

        currentCrypto = t.cryptoAmount - cryptoDecayed;
        totalDecayed = makerBondDecayed + takerBondDecayed + cryptoDecayed;
    }

    /**
     * @dev Maker'ın itibar durumuna göre teminat oranını döndürür.
     */
    function _getMakerBondBps(address _maker, uint8 _tier) internal view returns (uint256 bondBps) {
        if (_tier == 0) return MAKER_BOND_TIER0_BPS;
        else if (_tier == 1) bondBps = MAKER_BOND_TIER1_BPS;
        else if (_tier == 2) bondBps = MAKER_BOND_TIER2_BPS;
        else if (_tier == 3) bondBps = MAKER_BOND_TIER3_BPS;
        else bondBps = MAKER_BOND_TIER4_BPS;

        Reputation storage rep = reputation[_maker];
        if (rep.failedDisputes == 0 && rep.successfulTrades > 0) {
            bondBps = bondBps > GOOD_REP_DISCOUNT_BPS ? bondBps - GOOD_REP_DISCOUNT_BPS : 0;
        } else if (rep.failedDisputes >= 1) {
            bondBps += BAD_REP_PENALTY_BPS;
        }
    }

    /**
     * @dev Taker'ın itibar durumuna göre teminat oranını döndürür.
     */
    function _getTakerBondBps(address _taker, uint8 _tier) internal view returns (uint256 bondBps) {
        if (_tier == 0) return TAKER_BOND_TIER0_BPS;
        else if (_tier == 1) bondBps = TAKER_BOND_TIER1_BPS;
        else if (_tier == 2) bondBps = TAKER_BOND_TIER2_BPS;
        else if (_tier == 3) bondBps = TAKER_BOND_TIER3_BPS;
        else bondBps = TAKER_BOND_TIER4_BPS;

        Reputation storage rep = reputation[_taker];
        if (rep.failedDisputes == 0 && rep.successfulTrades > 0) {
            bondBps = bondBps > GOOD_REP_DISCOUNT_BPS ? bondBps - GOOD_REP_DISCOUNT_BPS : 0;
        } else if (rep.failedDisputes >= 1) {
            bondBps += BAD_REP_PENALTY_BPS;
        }
    }

    /**
     * @dev Kullanıcının on-chain itibar puanlarını günceller ve ceza atar.
     */
    function _updateReputation(address _wallet, bool _failed) internal {
        Reputation storage rep = reputation[_wallet];
        if (_failed) {
            rep.failedDisputes++;
            if (rep.failedDisputes >= 2) {
                rep.consecutiveBans++;
                uint256 banDays = 30 days * (2 ** (rep.consecutiveBans - 1));
                if (banDays > 365 days) banDays = 365 days;
                rep.bannedUntil = block.timestamp + banDays;

                if (rep.consecutiveBans >= 2) {
                    if (!hasTierPenalty[_wallet]) {
                        hasTierPenalty[_wallet] = true;
                        maxAllowedTier[_wallet] = 4;
                    }
                    if (maxAllowedTier[_wallet] > 0) maxAllowedTier[_wallet] = maxAllowedTier[_wallet] - 1;
                }
            }
        } else {
            rep.successfulTrades++;
            if (firstSuccessfulTradeAt[_wallet] == 0) firstSuccessfulTradeAt[_wallet] = block.timestamp;
        }

        emit ReputationUpdated(_wallet, rep.successfulTrades, rep.failedDisputes, rep.bannedUntil, _getEffectiveTier(_wallet));
    }

    /**
     * @dev Kullanıcının geçmiş işlemlerine bakarak izin verilen Tier seviyesini hesaplar.
     */
    function _getEffectiveTier(address _wallet) internal view returns (uint8) {
        Reputation storage rep = reputation[_wallet];
        uint8 calculatedTier;

        if (rep.successfulTrades >= 200 && rep.failedDisputes <= 15) calculatedTier = 4;
        else if (rep.successfulTrades >= 100 && rep.failedDisputes <= 10) calculatedTier = 3;
        else if (rep.successfulTrades >= 50 && rep.failedDisputes <= 5) calculatedTier = 2;
        else if (rep.successfulTrades >= 15 && rep.failedDisputes <= 2) calculatedTier = 1;
        else calculatedTier = 0;

        if (calculatedTier > 0) {
            if (firstSuccessfulTradeAt[_wallet] == 0 || block.timestamp < firstSuccessfulTradeAt[_wallet] + MIN_ACTIVE_PERIOD) {
                calculatedTier = 0;
            }
        }

        if (!hasTierPenalty[_wallet]) return calculatedTier;
        return calculatedTier > maxAllowedTier[_wallet] ? maxAllowedTier[_wallet] : calculatedTier;
    }

    /**
     * @dev Tier seviyesine göre maksimum işlem limitini döndürür.
     */
    function _getTierMaxAmount(uint8 _tier) internal pure returns (uint256) {
        if (_tier == 0) return TIER_MAX_AMOUNT_TIER0;
        if (_tier == 1) return TIER_MAX_AMOUNT_TIER1;
        if (_tier == 2) return TIER_MAX_AMOUNT_TIER2;
        if (_tier == 3) return TIER_MAX_AMOUNT_TIER3;
        return 0;
    }

    function getReputation(address _wallet) external view returns (uint256 successful, uint256 failed, uint256 bannedUntil, uint256 consecutiveBans, uint8 effectiveTier) {
        Reputation storage rep = reputation[_wallet];
        return (rep.successfulTrades, rep.failedDisputes, rep.bannedUntil, rep.consecutiveBans, _getEffectiveTier(_wallet));
    }

    function getFirstSuccessfulTradeAt(address _wallet) external view returns (uint256) { return firstSuccessfulTradeAt[_wallet]; }
    function getTrade(uint256 _tradeId) external view returns (Trade memory) { return trades[_tradeId]; }
    function getCurrentAmounts(uint256 _tradeId) external view returns (uint256 currentCrypto, uint256 currentMakerBond, uint256 currentTakerBond, uint256 totalDecayed) { return _calculateCurrentAmounts(_tradeId); }

    function antiSybilCheck(address _wallet) external view returns (bool aged, bool funded, bool cooldownOk) {
        aged = walletRegisteredAt[_wallet] != 0 && block.timestamp >= walletRegisteredAt[_wallet] + WALLET_AGE_MIN;
        funded = _wallet.balance >= DUST_LIMIT;
        cooldownOk = lastTradeAt[_wallet] == 0 || block.timestamp >= lastTradeAt[_wallet] + TIER0_TRADE_COOLDOWN;
    }

    function domainSeparator() external view returns (bytes32) { return _domainSeparatorV4(); }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert OwnableInvalidOwner(address(0));
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setSupportedToken(address _token, bool _supported) external onlyOwner {
        if (_token == address(0)) revert OwnableInvalidOwner(address(0));
        supportedTokens[_token] = _supported;
        emit TokenSupportUpdated(_token, _supported);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
