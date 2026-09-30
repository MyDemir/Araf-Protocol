import React from 'react';
import { SiweMessage } from 'siwe';
import { buildApiUrl } from '../apiConfig';
import { buildTermsStatement, isTermsAcceptedLocally, TERMS_VERSION } from '../legal/terms';

export const createSessionActions = ({
  address,
  connectedWallet,
  chainId,
  isConnected,
  isAuthenticated,
  authenticatedWallet,
  authChecked,
  lang = 'EN',
  signMessageAsync,
  disconnect,
  showToast,
  setIsLoggingIn,
  setIsAuthenticated,
  setAuthenticatedWallet,
  bestEffortBackendLogout,
  clearLocalSessionState,
  setShowWalletModal,
  openProfilePage,
}) => {
  const hasSignedSessionForActiveWallet = Boolean(
    isConnected
    && connectedWallet
    && isAuthenticated
    && authenticatedWallet === connectedWallet,
  );

  const requireSignedSessionForActiveWallet = () => {
    if (!authChecked) {
      showToast(
        lang === 'TR'
          ? 'Oturum doğrulanıyor. Lütfen 1-2 saniye sonra tekrar deneyin.'
          : 'Session check in progress. Please try again in a moment.',
        'info',
      );
      return false;
    }
    if (hasSignedSessionForActiveWallet) return true;
    showToast(
      lang === 'TR'
        ? 'Aktif cüzdan için imzalı oturum yok. Lütfen yeniden giriş yapın.'
        : 'No signed session for the active wallet. Please sign in again.',
      'error',
    );
    return false;
  };

  const handleLogoutAndDisconnect = async () => {
    await bestEffortBackendLogout();
    clearLocalSessionState({ navigateHome: true, closeModals: true });
    disconnect();
  };

  const loginWithSIWE = async () => {
    if (!address) return;
    // [TR] Koşullar kabul edilmeden imza istenmez; modal açıktır ve kabul düğmesi girişi başlatır.
    if (!isTermsAcceptedLocally(address)) {
      showToast(lang === 'TR' ? 'Devam etmek için önce kullanım koşullarını kabul edin.' : 'Please accept the terms of use first.', 'info');
      return;
    }
    try {
      setIsLoggingIn(true);
      showToast(lang === 'TR' ? 'Lütfen cüzdanınızdan imza isteğini onaylayın' : 'Please approve the signature request in your wallet', 'info');

      const nonceRes = await fetch(buildApiUrl(`auth/nonce?wallet=${address}`), { credentials: 'include' });
      if (!nonceRes.ok) {
        throw new Error('Nonce alınamadı');
      }
      const { nonce, siweDomain, siweUri } = await nonceRes.json();
      if (!siweDomain || !siweUri) {
        throw new Error('Backend SIWE konfigürasyonu eksik');
      }

      const siweMessage = new SiweMessage({
        domain: siweDomain,
        address,
        // [TR] Kabul beyanı imzalanan metnin parçasıdır; backend sürümü doğrular ve kaydeder.
        statement: buildTermsStatement(TERMS_VERSION),
        uri: siweUri,
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
      });
      const message = siweMessage.prepareMessage();
      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch(buildApiUrl('auth/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message, signature }),
      });

      if (verifyRes.ok) {
        const verifyData = await verifyRes.json().catch(() => ({}));
        const verifiedWallet = verifyData?.wallet?.toLowerCase?.() || null;
        if (!verifiedWallet || verifiedWallet !== connectedWallet) {
          await bestEffortBackendLogout();
          clearLocalSessionState();
          throw new Error('Aktif cüzdan ile oturum cüzdanı eşleşmiyor');
        }
        setIsAuthenticated(true);
        setAuthenticatedWallet(verifiedWallet);
        showToast(lang === 'TR' ? 'Sisteme başarıyla giriş yapıldı!' : 'Successfully signed in!', 'success');
      } else {
        const data = await verifyRes.json().catch(() => ({}));
        if (data.code === 'TERMS_NOT_ACCEPTED') {
          // [TR] Sunucu farklı bir koşul sürümü bekliyor (ör. yeni sürüm yayımlandı); sayfa yenilenince modal güncel sürümü sorar.
          showToast(lang === 'TR' ? 'Kullanım koşulları güncellendi. Sayfayı yenileyip yeni koşulları kabul edin.' : 'The terms were updated. Reload the page and accept the new terms.', 'error');
          return;
        }
        throw new Error(data.error || 'Doğrulama başarısız');
      }
    } catch (error) {
      console.error('SIWE Error:', error);
      if (error.message?.includes('rejected') || error.message?.includes('User rejected')) {
        showToast(lang === 'TR' ? 'İmza işlemi sizin tarafınızdan iptal edildi.' : 'Signature request was cancelled by you.', 'error');
      } else {
        showToast(lang === 'TR' ? 'Giriş başarısız oldu.' : 'Login failed.', 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAuthAction = () => {
    if (isConnected && !authChecked) {
      showToast(
        lang === 'TR'
          ? 'Cüzdan oturumu doğrulanıyor. Lütfen bekleyin.'
          : 'Validating wallet session. Please wait.',
        'info',
      );
      return;
    }
    if (!isConnected) setShowWalletModal(true);
    else if (!isAuthenticated) loginWithSIWE();
    // [TR] Oturum açıkken tek profil yüzeyi Profil Merkezi sayfasıdır (eski modal kaldırıldı).
    else openProfilePage?.('account');
  };

  return {
    hasSignedSessionForActiveWallet,
    requireSignedSessionForActiveWallet,
    handleLogoutAndDisconnect,
    loginWithSIWE,
    handleAuthAction,
  };
};

const SessionActionsContext = React.createContext({ createActions: createSessionActions });

export const SessionProvider = ({ children, actionFactory = createSessionActions }) => {
  const value = React.useMemo(() => ({ createActions: actionFactory }), [actionFactory]);
  return <SessionActionsContext.Provider value={value}>{children}</SessionActionsContext.Provider>;
};

export const useSessionActions = (dependencies) => {
  const { createActions } = React.useContext(SessionActionsContext);
  return React.useMemo(() => createActions(dependencies), [createActions, dependencies]);
};

export default SessionProvider;
