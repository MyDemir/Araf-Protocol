import { Wallet } from 'lucide-react';
import React from 'react';
import { ProfileNav } from './ProfilePanels';
import ProfileContextPanel from './ProfileContextPanel';

export const ProfileContextPage = (props) => {
  const { lang = 'EN', initialActiveTab = 'account', setInitialActiveTab } = props;
  const [activeTab, setActiveTabState] = React.useState(initialActiveTab || 'account');
  React.useEffect(() => {
    if (initialActiveTab) setActiveTabState(initialActiveTab);
  }, [initialActiveTab]);
  const setActiveTab = (nextTab) => {
    setActiveTabState(nextTab);
    setInitialActiveTab?.(nextTab);
  };

  // [TR] Oturum yokken 8 sekme boş "—" gösteriyordu; tek bir bağlan kartı yeterli.
  // [EN] Without a session the 8 tabs only showed "—"; a single connect card is enough.
  if (!props.isConnected || !props.isAuthenticated) {
    return (
      <div className="w-full max-w-[1200px] px-4 md:px-8">
        <h1 className="text-2xl font-bold text-textPrimary mb-4">{lang === 'TR' ? 'Profil Merkezi' : 'Profile Center'}</h1>
        <div className="bg-surface border border-borderSubtle rounded-2xl p-8 text-center max-w-md" data-testid="profile-connect-gate">
          <div className="mb-3 flex justify-center text-textMuted"><Wallet className="w-10 h-10" strokeWidth={1.8} aria-hidden="true" /></div>
          <p className="font-bold text-textPrimary">{lang === 'TR' ? 'Cüzdanınızı bağlayın' : 'Connect your wallet'}</p>
          <p className="text-sm text-textMuted mt-1">{lang === 'TR' ? 'Emirleriniz, işlemleriniz ve ödülleriniz burada görünür.' : 'Your orders, trades and rewards appear here.'}</p>
          {typeof props.onConnect === 'function' && (
            <button onClick={props.onConnect} className="mt-5 w-full py-3 rounded-xl bg-brand text-black font-bold text-sm hover:opacity-90 transition">
              {lang === 'TR' ? 'Cüzdan bağla' : 'Connect wallet'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1200px] px-4 md:px-8">
      <h1 className="text-2xl font-bold text-textPrimary mb-4">{lang === 'TR' ? 'Profil Merkezi' : 'Profile Center'}</h1>
      <ProfileNav lang={lang} activeTab={activeTab} setActiveTab={setActiveTab} />
      <ProfileContextPanel activeTab={activeTab} {...props} />
    </div>
  );
};

export default ProfileContextPage;
