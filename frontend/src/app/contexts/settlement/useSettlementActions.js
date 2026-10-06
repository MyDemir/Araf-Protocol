import React from 'react';
import {
  checkLiveProposalForAccept,
  getSettlementActionContext,
  normalizeLiveProposal,
  validateSettlementProposalInput,
  validateSettlementTradeId,
} from './settlementActionModel';

const getErrorMessage = (err, lang) => (
  err?.shortMessage || err?.reason || err?.message || (lang === 'TR' ? 'Settlement işlemi başarısız.' : 'Settlement transaction failed.')
);

export const useSettlementActions = ({
  activeTrade,
  userRole,
  address,
  lang = 'EN',
  contractFns = {},
  fetchMyTrades,
  showToast,
  isContractLoading,
  setIsContractLoading,
  nowTs,
}) => {
  // [TR] nowTs bağımlılığı şart: yoksa süre dolunca bağlam bayat kalır ve "süresi doldu" butonu pasif görünür.
  // [EN] nowTs must be a dependency, otherwise the context goes stale at expiry and the expire button stays disabled.
  const context = React.useMemo(
    () => getSettlementActionContext({ activeTrade, userRole, address, ...(Number.isFinite(nowTs) ? { nowTs } : {}) }),
    [activeTrade, userRole, address, nowTs],
  );

  // [TR] F3: kullanıcının onayladığı (önizlediği) teklifin zincirdeki anlık görüntüsü + değişiklik bilgisi.
  // [EN] F3: on-chain snapshot of the offer the user confirmed/previewed, plus change-review info.
  const [acceptSnapshot, setAcceptSnapshot] = React.useState(null);
  const [acceptReview, setAcceptReview] = React.useState(null);

  const readLiveProposal = React.useCallback(async (tradeId) => {
    if (typeof contractFns.getSettlementProposal !== 'function') return null;
    try {
      return await contractFns.getSettlementProposal(tradeId);
    } catch {
      return null;
    }
  }, [contractFns]);

  const refreshTradesAfterTx = React.useCallback(async () => {
    await fetchMyTrades?.();
  }, [fetchMyTrades]);

  const runTx = React.useCallback(async (fn, successMessage) => {
    try {
      setIsContractLoading(true);
      await fn();
      showToast(successMessage, 'success');
      await refreshTradesAfterTx();
      return true;
    } catch (err) {
      showToast(getErrorMessage(err, lang), 'error');
      return false;
    } finally {
      setIsContractLoading(false);
    }
  }, [lang, refreshTradesAfterTx, setIsContractLoading, showToast]);

  const block = React.useCallback((message) => {
    showToast(message, 'error');
    return false;
  }, [showToast]);

  const requireTradeId = React.useCallback(() => {
    const error = validateSettlementTradeId({ tradeId: context.onchainTradeId, lang });
    if (error) return { error };
    return { tradeId: BigInt(context.onchainTradeId) };
  }, [context.onchainTradeId, lang]);

  const propose = React.useCallback(async ({ makerShareBps, expiresAt }) => {
    if (isContractLoading) return false;
    if (!context.canPropose) {
      return block(lang === 'TR' ? 'Settlement teklifi şu anda oluşturulamaz.' : 'Settlement proposal cannot be created now.');
    }
    const validationError = validateSettlementProposalInput({
      tradeId: context.onchainTradeId,
      makerShareBps,
      expiresAt,
      lang,
    });
    if (validationError) return block(validationError);
    return runTx(
      () => contractFns.proposeSettlement(BigInt(context.onchainTradeId), Number(makerShareBps), Number(expiresAt)),
      lang === 'TR' ? 'Settlement teklifi zincire gönderildi.' : 'Settlement proposal submitted on-chain.',
    );
  }, [block, context.canPropose, context.onchainTradeId, contractFns, isContractLoading, lang, runTx]);

  const reviewMessage = React.useCallback((reason) => {
    const tr = lang === 'TR';
    if (reason === 'UNREADABLE') return tr ? 'Teklif zincirden okunamadı; güvenli biçimde kabul edilemez. Tekrar deneyin.' : 'The offer could not be read from the chain, so it cannot be accepted safely. Try again.';
    if (reason === 'NOT_PROPOSED') return tr ? 'Teklif artık aktif değil (geri çekilmiş, reddedilmiş ya da sonuçlanmış). Sayfayı yenileyin.' : 'The offer is no longer active (withdrawn, rejected or finalized). Refresh the page.';
    if (reason === 'EXPIRED') return tr ? 'Teklifin süresi doldu; kabul edilemez.' : 'The offer has expired and cannot be accepted.';
    return tr ? 'Teklif siz onaylamadan değişti. Güncel değerleri kontrol edip yeniden onaylayın.' : 'The offer changed before you confirmed. Check the current values and confirm again.';
  }, [lang]);

  // [TR] Önizleme adımı: güncel teklifi zincirden okur ve kullanıcının göreceği/onaylayacağı değeri sabitler.
  // [EN] Preview step: reads the live offer and pins the values the user will see and confirm.
  const prepareAccept = React.useCallback(async () => {
    const { tradeId, error } = requireTradeId();
    if (error) return { ok: false, error };
    const live = await readLiveProposal(tradeId);
    const nowSec = Number.isFinite(nowTs) ? nowTs : Math.floor(Date.now() / 1000);
    const normalized = normalizeLiveProposal(live);
    const check = checkLiveProposalForAccept({
      live,
      expected: normalized ? { id: normalized.id, makerShareBps: normalized.makerShareBps } : null,
      nowTs: nowSec,
    });
    if (!check.ok) {
      setAcceptSnapshot(null);
      setAcceptReview({ reason: check.reason, live: check.live });
      return { ok: false, error: reviewMessage(check.reason), reason: check.reason };
    }
    setAcceptReview(null);
    setAcceptSnapshot({ id: check.live.id, makerShareBps: check.live.makerShareBps });
    return { ok: true, live: check.live };
  }, [nowTs, readLiveProposal, requireTradeId, reviewMessage]);

  // [TR] Değişiklik sonrası kullanıcı güncel teklifi bilerek onaylar (tx göndermez; yalnız anlık görüntüyü günceller).
  // [EN] After a change the user knowingly re-confirms the live offer (no tx; only refreshes the snapshot).
  const confirmAcceptReview = React.useCallback(() => {
    if (acceptReview?.reason !== 'CHANGED' || !acceptReview.live) return null;
    const live = acceptReview.live;
    setAcceptSnapshot({ id: live.id, makerShareBps: live.makerShareBps });
    setAcceptReview(null);
    return live;
  }, [acceptReview]);

  const accept = React.useCallback(async () => {
    if (isContractLoading) return false;
    if (!context.canAccept) return block(lang === 'TR' ? 'Settlement teklifi kabul edilemez.' : 'Settlement proposal cannot be accepted.');
    const { tradeId, error } = requireTradeId();
    if (error) return block(error);
    // [TR] Kabul edilecek değer: önizlemede sabitlenen; yoksa ekrandaki (backend) teklif.
    const expected = acceptSnapshot || (context.proposal
      ? { id: context.proposal.id ?? context.proposal.proposal_id ?? null, makerShareBps: context.proposal.makerShareBps ?? context.proposal.maker_share_bps }
      : null);
    const live = await readLiveProposal(tradeId);
    const nowSec = Number.isFinite(nowTs) ? nowTs : Math.floor(Date.now() / 1000);
    const check = checkLiveProposalForAccept({ live, expected, nowTs: nowSec });
    if (!check.ok) {
      setAcceptReview({ reason: check.reason, live: check.live });
      return block(reviewMessage(check.reason));
    }
    setAcceptReview(null);
    return runTx(
      () => contractFns.acceptSettlement(tradeId, check.live.id),
      lang === 'TR' ? 'Settlement kabul edildi ve işlem on-chain kapanacak.' : 'Settlement accepted; trade will close on-chain.',
    );
  }, [acceptSnapshot, block, context.canAccept, context.proposal, contractFns, isContractLoading, lang, nowTs, readLiveProposal, requireTradeId, reviewMessage, runTx]);

  const reject = React.useCallback(async () => {
    if (isContractLoading) return false;
    if (!context.canReject) return block(lang === 'TR' ? 'Settlement teklifi reddedilemez.' : 'Settlement proposal cannot be rejected.');
    const { tradeId, error } = requireTradeId();
    if (error) return block(error);
    return runTx(
      () => contractFns.rejectSettlement(tradeId),
      lang === 'TR' ? 'Settlement teklifi reddedildi.' : 'Settlement proposal rejected.',
    );
  }, [block, context.canReject, contractFns, isContractLoading, lang, requireTradeId, runTx]);

  const withdraw = React.useCallback(async () => {
    if (isContractLoading) return false;
    if (!context.canWithdraw) return block(lang === 'TR' ? 'Settlement teklifi geri çekilemez.' : 'Settlement proposal cannot be withdrawn.');
    const { tradeId, error } = requireTradeId();
    if (error) return block(error);
    return runTx(
      () => contractFns.withdrawSettlement(tradeId),
      lang === 'TR' ? 'Settlement teklifi geri çekildi.' : 'Settlement proposal withdrawn.',
    );
  }, [block, context.canWithdraw, contractFns, isContractLoading, lang, requireTradeId, runTx]);

  const expire = React.useCallback(async () => {
    if (isContractLoading) return false;
    if (!context.canExpire) return block(lang === 'TR' ? 'Settlement teklifi süresi dolmuş olarak işaretlenemez.' : 'Settlement proposal cannot be marked expired.');
    const { tradeId, error } = requireTradeId();
    if (error) return block(error);
    return runTx(
      () => contractFns.expireSettlement(tradeId),
      lang === 'TR' ? 'Settlement teklifi süresi doldu olarak işaretlendi.' : 'Settlement proposal marked expired.',
    );
  }, [block, context.canExpire, contractFns, isContractLoading, lang, requireTradeId, runTx]);

  return React.useMemo(() => ({
    ...context,
    propose,
    accept,
    prepareAccept,
    confirmAcceptReview,
    acceptSnapshot,
    acceptReview,
    acceptReviewMessage: acceptReview ? reviewMessage(acceptReview.reason) : '',
    reject,
    withdraw,
    expire,
  }), [accept, acceptReview, acceptSnapshot, confirmAcceptReview, context, expire, prepareAccept, propose, reject, reviewMessage, withdraw]);
};

export default useSettlementActions;
