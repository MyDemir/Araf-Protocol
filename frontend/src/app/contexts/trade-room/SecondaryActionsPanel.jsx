import { ActionGuidanceButton } from './PrimaryActionPanel';
import { tx as t } from '../../copy';


// [TR] İkincil yollar yan yana küçük butonlardır; yalnız çalıştırılabilir aksiyonlar gösterilir (bilgi metni yok).
// [EN] Secondary paths are small side-by-side buttons; only executable actions are shown (no info text).
export const SecondaryActionsPanel = ({ secondaryActions = [], actionCallbacks, disabledReasons = [], lang = 'EN' }) => {
  const executable = secondaryActions.filter((action) => Boolean(actionCallbacks?.[action.key]) && ['contract', 'conditional'].includes(action.type));
  if (!executable.length) return null;
  return (
    <div className="mb-4" data-testid="trade-secondary-guidance">
      <p className="text-textMuted font-bold uppercase tracking-wide text-[11px] mb-2">{t(lang, 'Diğer seçenekler', 'Other options')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {executable.map((action) => (
          <ActionGuidanceButton key={action.key} action={action} actionCallbacks={actionCallbacks} disabledReasons={disabledReasons} variant="secondary" compact />
        ))}
      </div>
    </div>
  );
};

export default SecondaryActionsPanel;
