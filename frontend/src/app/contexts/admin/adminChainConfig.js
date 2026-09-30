import { parseAbi } from 'viem';

// [TR] Admin "Kontrat" sekmesi: sahip (owner) ayarlarını ZİNCİRDEN salt okunur gösterir. Backend bu değerleri
//      tutmaz; otorite kontrattır. Yazma (setFeeConfig, pause…) bilinçli olarak yoktur: owner multisig/Timelock
//      arkasında olmalıdır, tarayıcıdan tek imzayla parametre değiştirmek mainnet riskidir.
// [EN] Admin "On-chain" tab: read-only view of owner-controlled settings, straight from the contracts.
//      No write actions on purpose; parameter changes belong behind a multisig/Timelock.

// [TR] Adres/hash kısaltma (admin panelleri ortak). [EN] Address/hash shortener shared by admin panels.
export const shortId = (v) => { const s = String(v || ''); return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : (s || '—'); };

export const ESCROW_ADMIN_ABI = parseAbi([
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function treasury() view returns (address)',
  'function getFeeConfig() view returns (uint256 currentTakerFeeBps, uint256 currentMakerFeeBps)',
  'function getCooldownConfig() view returns (uint256 currentTier0TradeCooldown, uint256 currentTier1TradeCooldown)',
  'function getTokenConfig(address _token) view returns (bool supported, bool allowSellOrders, bool allowBuyOrders, uint8 decimals, uint256[4] tierMaxAmountsBaseUnit)',
  'function tradeCounter() view returns (uint256)',
  'function orderCounter() view returns (uint256)',
]);

export const VAULT_ADMIN_ABI = parseAbi([
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function rewardBps() view returns (uint256)',
  'function finalTreasury() view returns (address)',
  'function rewards() view returns (address)',
  'function treasuryReserve(address) view returns (uint256)',
  'function rewardReserve(address) view returns (uint256)',
]);

export const REWARDS_ADMIN_ABI = parseAbi([
  'function owner() view returns (address)',
  'function paused() view returns (bool)',
  'function currentEpoch() view returns (uint256)',
  'function epochDuration() view returns (uint256)',
  'function claimDelay() view returns (uint256)',
  'function claimWindow() view returns (uint256)',
]);

const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value || '')) && !/^0x0{40}$/.test(String(value));

// [TR] Her okuma bağımsızdır: biri başarısız olursa diğerleri yine gösterilir (null = okunamadı).
const safe = async (fn) => { try { return await fn(); } catch { return null; } };

const ownerKind = async (publicClient, owner) => {
  if (!isAddress(owner)) return null;
  const code = await safe(() => publicClient.getBytecode({ address: owner }));
  // A contract owner (multisig/Timelock) has bytecode; an EOA has none.
  return code && code !== '0x' ? 'contract' : 'eoa';
};

export async function readProtocolConfig({ publicClient, escrowAddress, vaultAddress, rewardsAddress, tokens = {} }) {
  if (!publicClient) throw new Error('NO_CLIENT');
  const read = (address, abi, functionName, args) => safe(() => publicClient.readContract({ address, abi, functionName, args }));

  const escrow = isAddress(escrowAddress) ? await (async () => {
    const [owner, paused, treasury, fee, cooldown, tradeCounter, orderCounter] = await Promise.all([
      read(escrowAddress, ESCROW_ADMIN_ABI, 'owner'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'paused'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'treasury'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'getFeeConfig'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'getCooldownConfig'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'tradeCounter'),
      read(escrowAddress, ESCROW_ADMIN_ABI, 'orderCounter'),
    ]);
    const tokenConfigs = await Promise.all(Object.entries(tokens).filter(([, addr]) => isAddress(addr)).map(async ([symbol, addr]) => {
      const cfg = await read(escrowAddress, ESCROW_ADMIN_ABI, 'getTokenConfig', [addr]);
      return { symbol, address: addr, config: cfg ? { supported: cfg[0], allowSellOrders: cfg[1], allowBuyOrders: cfg[2], decimals: Number(cfg[3]), tierMax: Array.from(cfg[4] || []) } : null };
    }));
    return {
      address: escrowAddress,
      owner,
      ownerKind: await ownerKind(publicClient, owner),
      paused,
      treasury,
      takerFeeBps: fee ? Number(fee[0]) : null,
      makerFeeBps: fee ? Number(fee[1]) : null,
      tier0CooldownSec: cooldown ? Number(cooldown[0]) : null,
      tier1CooldownSec: cooldown ? Number(cooldown[1]) : null,
      tradeCounter: tradeCounter ?? null,
      orderCounter: orderCounter ?? null,
      tokenConfigs,
    };
  })() : null;

  const vault = isAddress(vaultAddress) ? await (async () => {
    const [owner, paused, rewardBps, finalTreasury, rewards] = await Promise.all([
      read(vaultAddress, VAULT_ADMIN_ABI, 'owner'),
      read(vaultAddress, VAULT_ADMIN_ABI, 'paused'),
      read(vaultAddress, VAULT_ADMIN_ABI, 'rewardBps'),
      read(vaultAddress, VAULT_ADMIN_ABI, 'finalTreasury'),
      read(vaultAddress, VAULT_ADMIN_ABI, 'rewards'),
    ]);
    const reserves = await Promise.all(Object.entries(tokens).filter(([, addr]) => isAddress(addr)).map(async ([symbol, addr]) => ({
      symbol,
      treasuryReserve: await read(vaultAddress, VAULT_ADMIN_ABI, 'treasuryReserve', [addr]),
      rewardReserve: await read(vaultAddress, VAULT_ADMIN_ABI, 'rewardReserve', [addr]),
    })));
    return { address: vaultAddress, owner, ownerKind: await ownerKind(publicClient, owner), paused, rewardBps: rewardBps != null ? Number(rewardBps) : null, finalTreasury, rewards, reserves };
  })() : null;

  const rewards = isAddress(rewardsAddress) ? await (async () => {
    const [owner, paused, currentEpoch, epochDuration, claimDelay, claimWindow] = await Promise.all([
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'owner'),
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'paused'),
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'currentEpoch'),
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'epochDuration'),
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'claimDelay'),
      read(rewardsAddress, REWARDS_ADMIN_ABI, 'claimWindow'),
    ]);
    return {
      address: rewardsAddress,
      owner,
      ownerKind: await ownerKind(publicClient, owner),
      paused,
      currentEpoch: currentEpoch ?? null,
      epochDurationSec: epochDuration != null ? Number(epochDuration) : null,
      claimDelaySec: claimDelay != null ? Number(claimDelay) : null,
      claimWindowSec: claimWindow != null ? Number(claimWindow) : null,
    };
  })() : null;

  return { escrow, vault, rewards, readAt: new Date().toISOString() };
}

// [TR] Kontrat RevenueKind enum sırası (ArafEscrow.sol). [EN] Contract RevenueKind order.
export const REVENUE_KIND_LABELS = [
  { TR: 'Manuel onay ücreti', EN: 'Manual release fee' },
  { TR: 'Otomatik serbest bırakma / ceza', EN: 'Auto-release fee / penalty' },
  { TR: 'Kısmi uzlaşma ücreti', EN: 'Partial settlement fee' },
  { TR: 'İtirazlı onay ücreti', EN: 'Disputed release fee' },
  { TR: 'Yakım kalıntısı', EN: 'Burn residual' },
];
