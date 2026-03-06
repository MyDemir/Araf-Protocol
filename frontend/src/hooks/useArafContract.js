/**
 * useArafContract — ArafEscrow Kontrat Etkileşim Hook'u
 *
 * H-07 Fix: Frontend'in kontratla doğrudan etkileşim kurabilmesi için
 * tek merkezli hook. ABI, deploy scripti tarafından otomatik oluşturulan
 * frontend/src/abi/ArafEscrow.json'dan okunur.
 *
 * Desteklenen işlemler:
 *   - registerWallet / createEscrow / cancelOpenEscrow / lockEscrow
 *   - reportPayment / releaseFunds / challengeTrade / autoRelease / burnExpired
 *   - EIP-712 cancel: signCancelProposal → proposeOrApproveCancel
 *
 * Kullanım (App.jsx'te):
 *   const { releaseFunds, signCancelProposal, proposeOrApproveCancel } = useArafContract();
 */

import { useCallback } from 'react';
import { usePublicClient, useWalletClient, useChainId } from 'wagmi';
import { parseAbi } from 'viem';

// H-07 Fix: ABI deploy scripti tarafından otomatik oluşturulan dosyadan geliyor
// deploy.js çalıştırıldığında frontend/src/abi/ArafEscrow.json güncellenir
import ArafEscrowABI from '../abi/ArafEscrow.json';

const ESCROW_ADDRESS = import.meta.env.VITE_ESCROW_ADDRESS;

export function useArafContract() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  /**
   * @dev Temel kontrat çağrısı yardımcısı
   */
  const writeContract = useCallback(async (functionName, args = []) => {
    if (!walletClient) throw new Error("Cüzdan bağlı değil");
    if (!ESCROW_ADDRESS) throw new Error("VITE_ESCROW_ADDRESS .env'de tanımlı değil");

    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi:     ArafEscrowABI,
      functionName,
      args,
    });

    // İşlem onayını bekle
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt;
  }, [walletClient, publicClient]);

  // ── Kontrat Fonksiyonları ─────────────────────────────────────────────────

  const registerWallet = useCallback(() =>
    writeContract("registerWallet"), [writeContract]);

  const createEscrow = useCallback((token, cryptoAmount, tier) =>
    writeContract("createEscrow", [token, cryptoAmount, tier]), [writeContract]);

  // C-02 Fix: OPEN escrow'u iptal etmek için
  const cancelOpenEscrow = useCallback((tradeId) =>
    writeContract("cancelOpenEscrow", [tradeId]), [writeContract]);

  const lockEscrow = useCallback((tradeId) =>
    writeContract("lockEscrow", [tradeId]), [writeContract]);

  const reportPayment = useCallback((tradeId, ipfsHash) =>
    writeContract("reportPayment", [tradeId, ipfsHash]), [writeContract]);

  const releaseFunds = useCallback((tradeId) =>
    writeContract("releaseFunds", [tradeId]), [writeContract]);

  const challengeTrade = useCallback((tradeId) =>
    writeContract("challengeTrade", [tradeId]), [writeContract]);

  const autoRelease = useCallback((tradeId) =>
    writeContract("autoRelease", [tradeId]), [writeContract]);

  const burnExpired = useCallback((tradeId) =>
    writeContract("burnExpired", [tradeId]), [writeContract]);

  // ── EIP-712 Cancel İmzalama ───────────────────────────────────────────────

  /**
   * EIP-712 cancel proposal imzası oluşturur.
   * Backend'e gönderilecek imzayı döner; kontrata henüz yazılmaz.
   *
   * @param {bigint} tradeId
   * @param {bigint} nonce    - sigNonces[address] kontrat üzerinden okunmalı
   * @param {number} deadline - UNIX timestamp (saniye)
   * @returns {Promise<string>} hex imza
   */
  const signCancelProposal = useCallback(async (tradeId, nonce, deadline) => {
    if (!walletClient) throw new Error("Cüzdan bağlı değil");
    if (!ESCROW_ADDRESS) throw new Error("VITE_ESCROW_ADDRESS .env'de tanımlı değil");

    const domain = {
      name:              "ArafEscrow",
      version:           "1",
      chainId:           BigInt(chainId), // H-01 Fix: dinamik chainId
      verifyingContract: ESCROW_ADDRESS,
    };

    const types = {
      CancelProposal: [
        { name: "tradeId",  type: "uint256" },
        { name: "proposer", type: "address" },
        { name: "nonce",    type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      tradeId:  BigInt(tradeId),
      proposer: walletClient.account.address,
      nonce:    BigInt(nonce),
      deadline: BigInt(deadline),
    };

    const signature = await walletClient.signTypedData({ domain, types, primaryType: "CancelProposal", message });
    return signature;
  }, [walletClient, chainId]);

  /**
   * İmzayı kontrata göndererek cancel proposal'ı tamamlar.
   * Backend her iki tarafın imzaladığını bildirdiğinde çağrılır.
   *
   * @param {bigint} tradeId
   * @param {number} deadline
   * @param {string} signature - signCancelProposal'dan dönen hex imza
   */
  const proposeOrApproveCancel = useCallback((tradeId, deadline, signature) =>
    writeContract("proposeOrApproveCancel", [tradeId, deadline, signature]),
  [writeContract]);

  return {
    registerWallet,
    createEscrow,
    cancelOpenEscrow,
    lockEscrow,
    reportPayment,
    releaseFunds,
    challengeTrade,
    autoRelease,
    burnExpired,
    signCancelProposal,
    proposeOrApproveCancel,
  };
}
