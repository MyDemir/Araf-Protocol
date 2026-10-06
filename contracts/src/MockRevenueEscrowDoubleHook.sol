// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRevenueVaultDoubleHook {
    function noteEscrowRevenueIntent(address token, uint256 amount, uint8 kind, uint256 tradeId) external;
    function onArafRevenue(address token, uint256 amount, uint8 kind, uint256 tradeId) external;
}

/**
 * @notice TEST ONLY. Aynı tx içinde intent → transfer → hook → ikinci hook çağırır; tüketilen niyetin
 *         silindiğini (ikinci hook MissingRevenueIntent ile reddedilir) doğrulamak için.
 * @notice TEST ONLY. Runs intent → transfer → hook → second hook in one tx to prove the consumed intent is
 *         cleared (the second hook must revert with MissingRevenueIntent).
 */
contract MockRevenueEscrowDoubleHook {
    function pushRevenueTwice(
        address vault,
        address token,
        uint256 amount,
        uint8 kind,
        uint256 tradeId
    ) external {
        IRevenueVaultDoubleHook(vault).noteEscrowRevenueIntent(token, amount, kind, tradeId);
        IERC20(token).transfer(vault, amount);
        IRevenueVaultDoubleHook(vault).onArafRevenue(token, amount, kind, tradeId);
        IRevenueVaultDoubleHook(vault).onArafRevenue(token, amount, kind, tradeId);
    }
}
