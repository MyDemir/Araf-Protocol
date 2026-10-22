// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @notice TEST ONLY. ArafRevenueVault.setRewards bağ kontrolünü (K3-04) geçen en küçük Rewards yüzeyi:
 *         revenueVault() getter'ı ve vault'un StaleTargetEpoch kontrolü için ayarlanabilir currentEpoch().
 *         Vault testleri bu adresi impersonate ederek transferEpochAllocation çağırır.
 * @notice TEST ONLY. Smallest Rewards surface that passes the setRewards binding check (K3-04).
 */
contract MockRewardsBinding {
    address public immutable revenueVault;
    uint256 public currentEpoch;

    constructor(address _revenueVault) {
        revenueVault = _revenueVault;
    }

    function setCurrentEpoch(uint256 _epoch) external {
        currentEpoch = _epoch;
    }
}
