import { ChevronRight, Wallet } from 'lucide-react';
import { buildWalletDeepLinks } from '../app/mobileWallet';

// [TR] Mobil + injected yok: cüzdan uygulamasının dahili tarayıcısında siteyi açan bağlantılar.
// [EN] Mobile + no injected provider: links that open this site inside the wallet app's in-app browser.
export default function MobileWalletPicker({ lang = 'TR', location, connectors = [], onConnect }) {
  const tr = lang === 'TR';
  const links = buildWalletDeepLinks(location);
  // [TR] Genel "Injected" bağlayıcı mobilde işe yaramaz; Coinbase Smart Wallet (popup) ve diğerleri kalır.
  const usable = connectors.filter((c) => c.id !== 'injected');
  const rowCls = 'w-full flex items-center justify-between bg-elevated hover:border-brand/50 border border-borderSubtle px-4 py-3 rounded-xl transition group';
  return (
    <div data-testid="mobile-wallet-picker" className="space-y-2">
      <p className="text-sm text-textSecondary bg-elevated border border-borderSubtle rounded-xl p-3">
        {tr
          ? 'Mobil tarayıcıda cüzdan yok. Siteyi cüzdan uygulamanızın tarayıcısında açın:'
          : 'There is no wallet in this mobile browser. Open the site in your wallet app browser:'}
      </p>
      {links.map((l) => (
        <a key={l.id} href={l.href} rel="noopener noreferrer" data-wallet-link={l.id} className={rowCls}>
          <span className="flex items-center gap-3">
            <span className="w-8 h-8 flex items-center justify-center"><Wallet className="w-6 h-6 text-textSecondary" strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="font-semibold text-textPrimary">{tr ? `${l.name} ile aç` : `Open in ${l.name}`}</span>
          </span>
          <ChevronRight className="w-4 h-4 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
        </a>
      ))}
      {usable.map((connector) => (
        <button key={connector.uid} type="button" onClick={() => onConnect(connector)} className={rowCls}>
          <span className="flex items-center gap-3">
            <span className="w-8 h-8 flex items-center justify-center"><Wallet className="w-6 h-6 text-textSecondary" strokeWidth={1.8} aria-hidden="true" /></span>
            <span className="font-semibold text-textPrimary">
              {/coinbase/i.test(connector.name) ? (tr ? 'Coinbase Smart Wallet ile bağlan' : 'Connect with Coinbase Smart Wallet') : connector.name}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
