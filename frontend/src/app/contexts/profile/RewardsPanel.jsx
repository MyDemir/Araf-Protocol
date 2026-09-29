import React from 'react';
import { formatUnits } from 'viem';
import RewardsDashboard from '../../../components/RewardsDashboard';
import { useRewardsContract } from '../../../hooks/useRewardsContract';

const TOKEN_ADDRESSES = {
  USDT: import.meta.env.VITE_USDT_ADDRESS || '',
  USDC: import.meta.env.VITE_USDC_ADDRESS || '',
};

/**
 * [TR] Proof of Peace ödül talebi. Kontrat claim'i yalnız biten dönem için açar; bu yüzden
 *      varsayılan hedef bir önceki dönemdir. Önceki kodda hook ve dashboard hiçbir ekrana bağlı değildi.
 * [EN] Proof of Peace claim panel. Claims open only for finished epochs, so the default target is
 *      the previous epoch. Previously the hook and dashboard were not wired into any screen.
 */
export const RewardsPanel = ({ lang = 'EN', address, showToast, tokenDecimalsMap = {} }) => {
  const rewards = useRewardsContract();
  const [token, setToken] = React.useState('USDT');
  const [currentEpoch, setCurrentEpoch] = React.useState(null);
  const [claimState, setClaimState] = React.useState({ status: 'loading', value: null, error: null });
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const targetEpoch = currentEpoch != null && currentEpoch > 0n ? currentEpoch - 1n : null;
  const tokenAddress = TOKEN_ADDRESSES[token];
  const decimals = Number(tokenDecimalsMap?.[token]) || 6;

  React.useEffect(() => {
    let cancelled = false;
    if (!rewards.isConfigured) {
      setClaimState({ status: 'error', value: null, error: lang === 'TR' ? 'Ödül kontratı yapılandırılmadı' : 'Rewards contract not configured' });
      return undefined;
    }
    if (!rewards.isSupportedChain) {
      setClaimState({ status: 'blocked', value: null, error: 'wrong_chain' });
      return undefined;
    }
    rewards.currentEpoch()
      .then((epoch) => { if (!cancelled) setCurrentEpoch(BigInt(epoch)); })
      .catch((err) => { if (!cancelled) setClaimState({ status: 'error', value: null, error: err?.shortMessage || err?.message }); });
    return () => { cancelled = true; };
  }, [rewards, lang]);

  React.useEffect(() => {
    let cancelled = false;
    if (!address || !tokenAddress || targetEpoch == null) return undefined;
    setClaimState({ status: 'loading', value: null, error: null });
    rewards.getClaimableState(targetEpoch, address, tokenAddress).then((state) => {
      if (!cancelled) setClaimState(state);
    });
    return () => { cancelled = true; };
  }, [rewards, address, tokenAddress, targetEpoch, refreshKey]);

  const handleClaim = async () => {
    if (targetEpoch == null || !tokenAddress) return;
    try {
      setIsClaiming(true);
      // [TR] Dönem henüz kapatılmadıysa önce herkese açık finalize çağrılır (owner beklenmez), sonra claim.
      // [EN] If the epoch is not finalized yet, the permissionless finalize runs first (no owner wait), then claim.
      if (!(await rewards.epochTokenFinalized(targetEpoch, tokenAddress))) {
        await rewards.finalizeEpochToken(targetEpoch, tokenAddress);
      }
      await rewards.claim(targetEpoch, tokenAddress);
      showToast?.(lang === 'TR' ? 'Ödül cüzdanınıza gönderildi.' : 'Reward sent to your wallet.', 'success');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast?.(err?.shortMessage || err?.message || (lang === 'TR' ? 'Talep başarısız.' : 'Claim failed.'), 'error');
    } finally {
      setIsClaiming(false);
    }
  };

  let claimableDisplay = null;
  try {
    if (claimState.value != null) {
      claimableDisplay = `${Number(formatUnits(BigInt(claimState.value), decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 })} ${token}`;
    }
  } catch {
    claimableDisplay = null;
  }

  return (
    <RewardsDashboard
      wallet={address}
      lang={lang}
      currentEpoch={targetEpoch != null ? String(targetEpoch) : null}
      claimableAmount={claimState.value ?? 0n}
      claimableDisplay={claimableDisplay}
      claimableState={claimState.status}
      claimableError={claimState.error}
      isClaiming={isClaiming}
      onClaim={handleClaim}
    >
      <div className="flex gap-1 p-1 rounded-lg bg-elevated border border-borderSubtle w-fit">
        {Object.keys(TOKEN_ADDRESSES).map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => setToken(symbol)}
            className={`px-3 py-1 rounded-md text-xs font-bold ${token === symbol ? 'bg-surface text-textPrimary shadow-sm' : 'text-textMuted hover:text-textPrimary'}`}
          >
            {symbol}
          </button>
        ))}
      </div>
    </RewardsDashboard>
  );
};

export default RewardsPanel;
