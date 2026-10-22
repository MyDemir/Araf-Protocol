// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IProbeEscrowView {
    function getFirstSuccessfulTradeAt(address _wallet) external view returns (uint256);
}

/**
 * @notice TEST ONLY. Treasury rolünde, onArafRevenue hook'u sırasında escrow view'larını okur (K1-06 CEI).
 *         Terminal snapshot'ı ham staticcall ile okur (getRewardableTrade tuple'ının 10. kelimesi = outcome,
 *         13. kelimesi = terminalAt) ve probe cüzdanının firstSuccessfulTradeAt değerini kaydeder.
 * @notice TEST ONLY. Acts as treasury and reads escrow views during the onArafRevenue hook (K1-06 CEI).
 */
contract MockRevenueProbe {
    address public immutable escrow;
    address public probeWallet;
    uint256 public seenOutcome;
    uint256 public seenTerminalAt;
    uint256 public seenFirstSuccessAt;
    uint256 public hookCount;

    constructor(address _escrow) {
        escrow = _escrow;
    }

    function setProbeWallet(address _wallet) external {
        probeWallet = _wallet;
    }

    function noteEscrowRevenueIntent(address, uint256, uint8, uint256) external {}

    function onArafRevenue(address, uint256, uint8, uint256 tradeId) external {
        (bool ok, bytes memory ret) = escrow.staticcall(abi.encodeWithSignature("getRewardableTrade(uint256)", tradeId));
        require(ok && ret.length >= 15 * 32, "PROBE_VIEW");
        uint256 outcome;
        uint256 terminalAt;
        assembly {
            outcome := mload(add(ret, add(32, mul(9, 32))))
            terminalAt := mload(add(ret, add(32, mul(12, 32))))
        }
        seenOutcome = outcome;
        seenTerminalAt = terminalAt;
        if (probeWallet != address(0)) {
            seenFirstSuccessAt = IProbeEscrowView(escrow).getFirstSuccessfulTradeAt(probeWallet);
        }
        hookCount += 1;
    }
}
