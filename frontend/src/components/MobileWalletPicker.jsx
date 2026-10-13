import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { buildWalletDeepLinks } from '../app/mobileWallet';
import { BrowserWalletBadge, ConnectorIcon, MetaMaskBadge, OkxBadge, TrustBadge, WalletLinkIcon } from './wallet-icons';

// [TR] Cüzdan seçeneği kartı ve içindeki dokunma alanı (≥44px). Masaüstü listesi de aynı stili kullanır.
// [EN] Wallet option card and its hit area (≥44px). The desktop list reuses the same styling.
export const walletCardCls = (active = false) =>
  `overflow-hidden rounded-2xl border bg-elevated transition-colors duration-150 motion-reduce:transition-none ${
    active ? 'border-brand/50' : 'border-borderSubtle hover:border-brand/40'
  }`;
export const walletRowCls =
  'group flex w-full min-h-[64px] items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition duration-150 hover:bg-brand/[0.06] active:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand motion-reduce:transition-none';

export function WalletOption({ icon, label, trailing, ...buttonProps }) {
  return (
    <div className={walletCardCls()}>
      <button type="button" className={walletRowCls} {...buttonProps}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-textPrimary">{label}</span>
        {trailing ?? <ChevronRight className="h-5 w-5 shrink-0 text-textSecondary transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-textPrimary motion-reduce:transition-none" strokeWidth={2} aria-hidden="true" />}
      </button>
    </div>
  );
}

// [TR] Mobil + injected yok: iki ana seçenek. 1) Cüzdan: yerinde açılan alt liste (cüzdan uygulamasının dahili
//      tarayıcısında siteyi açan bağlantılar; bağlanmayı denemez). 2) Coinbase Wallet: doğrudan bağlanır.
// [EN] Mobile + no injected provider: two main options. 1) Browser wallet: inline list of deeplinks (no connect
//      attempt). 2) Coinbase Wallet connector: connects directly.
export default function MobileWalletPicker({ lang = 'TR', location, connectors = [], onConnect }) {
  const tr = lang === 'TR';
  const [open, setOpen] = useState(false);
  // [TR] Açılış geçişi: liste önce kapalı yükseklikte (0fr) çizilir, bir kare sonra 1fr'e geçer.
  // [EN] Expand transition: list renders at 0fr first, then moves to 1fr on the next frame.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  const toggle = () => {
    if (open) setEntered(false);
    setOpen((v) => !v);
  };
  const links = buildWalletDeepLinks(location);
  const others = connectors.filter((c) => c.id !== 'injected');

  return (
    <div data-testid="mobile-wallet-picker" className="space-y-2.5">
      <div className={walletCardCls(open)}>
        <button
          type="button"
          data-testid="browser-wallet-toggle"
          aria-expanded={open}
          aria-controls="mobile-wallet-options"
          onClick={toggle}
          className={walletRowCls}
        >
          <BrowserWalletBadge />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-textPrimary">{tr ? 'Cüzdan' : 'Browser wallet'}</span>
          {!open && (
            <span className="flex shrink-0 items-center -space-x-1" aria-hidden="true">
              {[MetaMaskBadge, OkxBadge, TrustBadge].map((Badge, i) => (
                <span key={i} className="flex rounded-[30%] bg-elevated p-[2px]"><Badge className="h-[22px] w-[22px]" /></span>
              ))}
            </span>
          )}
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-textSecondary transition-transform duration-200 group-hover:text-textPrimary motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div
            id="mobile-wallet-options"
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
              entered ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="border-t border-borderSubtle px-3.5 pb-3.5 pt-3">
                <p className="mb-2.5 text-xs font-medium text-textSecondary">
                  {tr ? 'Cüzdan uygulamasında aç' : 'Open in your wallet app'}
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {links.map((l) => (
                    <li key={l.id}>
                      <a
                        href={l.href}
                        rel="noopener noreferrer"
                        data-wallet-link={l.id}
                        aria-label={tr ? `${l.name} ile aç` : `Open in ${l.name}`}
                        className="group/tile relative flex min-h-[56px] items-center gap-2.5 rounded-xl border border-borderSubtle bg-surface py-2 pl-2.5 pr-6 transition duration-150 hover:border-brand/40 hover:bg-brand/[0.06] active:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
                      >
                        <WalletLinkIcon id={l.id} className="h-8 w-8" />
                        {/* [TR] Kutucukta kısa ad (simge zaten tanıtır); tam ad aria-label'da. [EN] Short name; full name in aria-label. */}
                        <span className="min-w-0 truncate text-sm font-semibold text-textPrimary">{l.name.replace(/\s+Wallet$/, '')}</span>
                        <ArrowUpRight className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-textSecondary group-hover/tile:text-textPrimary" strokeWidth={2} aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      {others.map((connector) => (
        <WalletOption
          key={connector.uid}
          onClick={() => onConnect(connector)}
          icon={<ConnectorIcon connector={connector} />}
          label={connector.name}
        />
      ))}
    </div>
  );
}
