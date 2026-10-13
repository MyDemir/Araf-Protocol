import { SystemStatusBar } from './SystemStatusBar';
import ErrorBoundary from '../../components/ErrorBoundary';

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
      {/* [TR] Bant çökerse sessizce düşer; site açık kalır. */}
      {status ? <ErrorBoundary scope="section" fallback={null}><SystemStatusBar {...status} /></ErrorBoundary> : null}
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
