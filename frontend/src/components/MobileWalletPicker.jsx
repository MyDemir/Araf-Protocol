import { useState } from 'react';
import { ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { buildWalletDeepLinks } from '../app/mobileWallet';

// [TR] Mobil + injected yok: iki ana buton. 1) Tarayıcı cüzdanı: yerinde açılan alt liste (cüzdan uygulamasının
//      dahili tarayıcısında siteyi açan bağlantılar; bağlanmayı denemez). 2) Coinbase Wallet: doğrudan bağlanır.
// [EN] Mobile + no injected provider: two main buttons. 1) Browser wallet: inline accordion of deeplinks (no connect
//      attempt). 2) Coinbase Wallet connector: connects directly.
export default function MobileWalletPicker({ lang = 'TR', location, connectors = [], onConnect }) {
  const tr = lang === 'TR';
  const [open, setOpen] = useState(false);
  const links = buildWalletDeepLinks(location);
  const others = connectors.filter((c) => c.id !== 'injected');
  const rowCls = 'w-full flex items-center justify-between gap-3 bg-elevated hover:border-brand/50 border border-borderSubtle px-4 py-3 rounded-xl transition group';
  const icon = <span className="w-8 h-8 flex shrink-0 items-center justify-center"><Wallet className="w-6 h-6 text-textSecondary" strokeWidth={1.8} aria-hidden="true" /></span>;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div data-testid="mobile-wallet-picker" className="space-y-2">
      <div>
        <button
          type="button"
          data-testid="browser-wallet-toggle"
          aria-expanded={open}
          aria-controls="mobile-wallet-options"
          onClick={() => setOpen((v) => !v)}
          className={rowCls}
        >
          <span className="flex min-w-0 items-center gap-3">
            {icon}
            <span className="min-w-0 truncate font-semibold text-textPrimary">{tr ? 'Cüzdan' : 'Browser wallet'}</span>
          </span>
          <Chevron className="w-4 h-4 shrink-0 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
        </button>
        {open && (
          <div id="mobile-wallet-options" className="mt-1.5 ml-4 space-y-1.5 border-l border-borderSubtle pl-3">
            <p className="text-xs text-textMuted">
              {tr ? 'Siteyi cüzdan uygulamanızın tarayıcısında açın:' : 'Open the site in your wallet app browser:'}
            </p>
            {links.map((l) => (
              <a
                key={l.id}
                href={l.href}
                rel="noopener noreferrer"
                data-wallet-link={l.id}
                className="w-full flex items-center justify-between gap-3 bg-elevated hover:border-brand/50 border border-borderSubtle px-3 py-2 rounded-lg text-sm transition group"
              >
                <span className="min-w-0 truncate font-medium text-textPrimary">{tr ? `${l.name} ile aç` : `Open in ${l.name}`}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
      {others.map((connector) => (
        <button key={connector.uid} type="button" onClick={() => onConnect(connector)} className={rowCls}>
          <span className="flex min-w-0 items-center gap-3">
            {icon}
            <span className="min-w-0 truncate font-semibold text-textPrimary">{connector.name}</span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-textMuted group-hover:text-brand" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
