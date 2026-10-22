// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @notice TEST ONLY. Treasury rolünde: noteEscrowRevenueIntent nedenli revert eder, onArafRevenue de (intent
 *         olmadığı için) revert eder. K3-09: escrow kök nedeni (intent revert verisi) dışarı taşımalıdır.
 * @notice TEST ONLY. Intent reverts with a reason and the hook reverts too (K3-09 root-cause surfacing).
 */
contract MockRevenueIntentReverter {
    address public immutable escrow;

    error IntentRejected(uint256 code);

    constructor(address _escrow) {
        escrow = _escrow;
    }

    function noteEscrowRevenueIntent(address, uint256, uint8, uint256) external pure {
        revert IntentRejected(42);
    }

    function onArafRevenue(address, uint256, uint8, uint256) external pure {
        revert("NO_INTENT");
    }
}
