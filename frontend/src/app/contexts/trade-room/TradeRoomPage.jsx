import React from 'react';
import { buildTradeDecisionModel } from './tradeDecisionModel';
import PrimaryActionPanel from './PrimaryActionPanel';
import SecondaryActionsPanel from './SecondaryActionsPanel';
import { StateGuidancePanel, TechnicalDetailsDisclosure, TimerStack, TradeSummaryCard } from './TradeRoomPanels';

/**
 * [TR] İşlem odası sırası: özet → (ödeme bilgisi gibi) önce görülmesi gerekenler → tek birincil aksiyon
 *      (girdileriyle) → ikincil seçenekler → yalnız ilgili sayaçlar → durum kartları → teknik detay.
 *      Her aksiyon yalnız bir kez gösterilir.
 * [EN] Order: summary → must-see-first content → single primary action (with its inputs) → secondary
 *      options → relevant timers only → state cards → technical details. Each action appears once.
 */
export const TradeRoomPage = ({ decisionInput, actionCallbacks, beforeActions = null, primaryInput = null, children }) => {
  const model = React.useMemo(() => buildTradeDecisionModel(decisionInput || {}), [decisionInput]);
  const lang = decisionInput?.lang || 'EN';
  return (
    <>
      <TradeSummaryCard {...model.decisionSummary} stateLabel={model.stateLabel} roleLabel={model.roleLabel} lang={lang} />
      <StateGuidancePanel guidance={model.guidance} highlightFirst={Boolean(model.makerChallengeWindow?.open)} riskCopy={model.riskCopy} />
      {beforeActions}
      <PrimaryActionPanel primaryAction={model.primaryAction} disabledReasons={model.disabledReasons} actionCallbacks={actionCallbacks} lang={lang}>
        {primaryInput}
      </PrimaryActionPanel>
      <SecondaryActionsPanel secondaryActions={model.secondaryActions} disabledReasons={model.globalDisabledReasons || []} actionCallbacks={actionCallbacks} lang={lang} />
      <TimerStack timerCards={model.timerCards} lang={lang} />
      {children}
      <TechnicalDetailsDisclosure technicalDetails={model.technicalDetails} lang={lang} />
    </>
  );
};

export default TradeRoomPage;
