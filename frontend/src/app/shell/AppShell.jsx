import { SystemStatusBar } from './SystemStatusBar';
import ErrorBoundary from '../../components/ErrorBoundary';

// [TR] F4-10: Bant çökerse kritik uyarılar (ESCROW_MISMATCH vb.) sessizce kaybolmasın; hata ayrıntısı göstermeyen sade satır.
// [EN] F4-10: if the status bar crashes, critical warnings must not vanish silently; plain line, no error detail.
const StatusBarFallback = ({ lang }) => (
  <div
    role="alert"
    data-testid="system-status-fallback"
    className="w-full border-b border-danger/30 bg-danger/10 px-4 py-2 text-sm text-textPrimary"
  >
    {String(lang).toUpperCase() === 'TR'
      ? 'Sistem durumu görüntülenemiyor; kritik uyarılar gösterilemiyor olabilir. Sayfayı yenileyin.'
      : 'System status unavailable; critical warnings may not be shown. Please reload the page.'}
  </div>
);

export const AppShell = ({
  children,
  status = null,
  navigation = null,
  panel = null,
  outlet = null,
  modals = null,
  mobileTop = null,
  mobileBottom = null,
}) => {
  return (
    <>
      {/* [TR] Bant çökerse sade uyarı satırı görünür; site açık kalır. */}
      {status ? <ErrorBoundary scope="section" fallback={<StatusBarFallback lang={status.lang} />}><SystemStatusBar {...status} /></ErrorBoundary> : null}
      {mobileTop}
      <div className="flex min-w-0 flex-col md:flex-row min-h-0 flex-1">
        {navigation}
        {panel}
        {outlet || children}
      </div>
      {mobileBottom}
      {modals}
    </>
  );
};

export default AppShell;
