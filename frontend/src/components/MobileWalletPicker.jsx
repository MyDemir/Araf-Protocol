import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { buildWalletDeepLinks } from '../app/mobileWallet';
import { groupWalletConnectors } from '../app/walletOptions';
import { BrowserWalletBadge, ConnectorIcon, MetaMaskBadge, OkxBadge, TrustBadge, WalletLinkIcon } from './wallet-icons';

// [TR] Cüzdan seçeneği kartı ve içindeki dokunma alanı (≥44px). Masaüstü listesi de aynı stili kullanır.
// [EN] Wallet option card and its hit area (≥44px). The desktop list reuses the same styling.
export const walletCardCls = (active = false) =>
  `overflow-hidden rounded-2xl border bg-elevated transition-colors duration-150 motion-reduce:transition-none ${
    active ? 'border-brand/50' : 'border-borderSubtle hover:border-brand/40'
  }`;
export const walletRowCls =
  'group flex w-full min-h-[64px] items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition duration-150 hover:bg-brand/[0.06] active:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand motion-reduce:transition-none';

export function WalletOption({ icon, label, sublabel, trailing, ...buttonProps }) {
  return (
    <div className={`${walletCardCls()} ${buttonProps.disabled ? 'opacity-60' : ''}`}>
      <button type="button" className={`${walletRowCls} ${buttonProps.disabled ? 'cursor-not-allowed' : ''}`} {...buttonProps}>
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-textPrimary">{label}</span>
          {sublabel && <span className="block truncate text-xs text-textSecondary">{sublabel}</span>}
        </span>
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
  const { walletConnect, coinbase } = groupWalletConnectors(connectors, null);

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
                        className="flex min-h-[56px] items-center gap-2.5 rounded-xl border border-borderSubtle bg-surface px-2.5 py-2 transition duration-150 hover:border-brand/40 hover:bg-brand/[0.06] active:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
                      >
                        <WalletLinkIcon id={l.id} className="h-8 w-8" />
                        {/* [TR] Kutucukta kısa ad (simge zaten tanıtır); tam ad aria-label'da. [EN] Short name; full name in aria-label. */}
                        <span className="min-w-0 truncate text-sm font-semibold text-textPrimary">{l.name.replace(/\s+Wallet$/, '')}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
      <WalletConnectRow lang={lang} connector={walletConnect} onConnect={onConnect} />
      <CoinbaseRow connector={coinbase} onConnect={onConnect} />
    </div>
  );
}

// [TR] 2. seçenek: WalletConnect bağlayıcısı yoksa (proje kimliği yok/geçersiz) satır HİÇ çizilmez.
export function WalletConnectRow({ lang = 'TR', connector, onConnect }) {
  if (!connector) return null;
  const tr = lang === 'TR';
  return (
    <WalletOption
      data-testid="wallet-option-walletconnect"
      onClick={() => onConnect(connector)}
      icon={<ConnectorIcon connector={connector} />}
      label="WalletConnect"
      sublabel={tr ? 'Mobil cüzdan uygulaması' : 'Mobile wallet app'}
    />
  );
}

// [TR] 3. seçenek: Coinbase Wallet.
export function CoinbaseRow({ connector, onConnect }) {
  if (!connector) return null;
  return (
    <WalletOption
      data-testid="wallet-option-coinbase"
      onClick={() => onConnect(connector)}
      icon={<ConnectorIcon connector={connector} />}
      label="Coinbase Wallet"
    />
  );
}

// [TR] 1. seçenek (masaüstü / cüzdanın kendi tarayıcısı): tek cüzdan → tek dokunuşla bağlan; birden çok → alt liste.
//      Hiç yoksa satır pasif ("Kurulu değil").
// [EN] Option 1 (desktop / in-wallet browser): one wallet connects in one tap; several open a sub-list; none = disabled row.
export function BrowserWalletsRow({ lang = 'TR', wallets = [], onConnect, renderIcon }) {
  const tr = lang === 'TR';
  const [open, setOpen] = useState(false);
  const iconOf = (c) => (c.icon
    ? <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[28%]">{renderIcon ? renderIcon(c) : <img src={c.icon} alt="" className="h-7 w-7 rounded-md" />}</span>
    : <BrowserWalletBadge />);
  const nameOf = (c) => (c.id === 'injected' && c.name === 'Injected' ? (tr ? 'Tarayıcı cüzdanı' : 'Browser wallet') : c.name);
  if (wallets.length === 0) {
    return (
      <WalletOption
        data-testid="wallet-option-browser"
        disabled
        icon={<BrowserWalletBadge />}
        label={tr ? 'Tarayıcı cüzdanı' : 'Browser wallet'}
        sublabel={tr ? 'Bu tarayıcıda cüzdan eklentisi yok' : 'No wallet extension in this browser'}
        trailing={<span className="shrink-0 text-xs font-medium text-textMuted">{tr ? 'Kurulu değil' : 'Not installed'}</span>}
      />
    );
  }
  if (wallets.length === 1) {
    const only = wallets[0];
    return (
      <WalletOption
        data-testid="wallet-option-browser"
        onClick={() => onConnect(only)}
        icon={iconOf(only)}
        label={nameOf(only)}
        sublabel={tr ? 'Bu tarayıcıdaki cüzdan' : 'Wallet in this browser'}
      />
    );
  }
  return (
    <div className={walletCardCls(open)} data-testid="wallet-option-browser-group">
      <button
        type="button"
        data-testid="wallet-option-browser"
        aria-expanded={open}
        aria-controls="browser-wallet-list"
        onClick={() => setOpen((v) => !v)}
        className={walletRowCls}
      >
        <BrowserWalletBadge />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-textPrimary">{tr ? 'Tarayıcı cüzdanı' : 'Browser wallet'}</span>
          <span className="block truncate text-xs text-textSecondary">{tr ? `${wallets.length} cüzdan bulundu` : `${wallets.length} wallets found`}</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-textSecondary transition-transform duration-200 group-hover:text-textPrimary motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <ul id="browser-wallet-list" className="space-y-1.5 border-t border-borderSubtle px-3 pb-3 pt-3">
          {wallets.map((c) => (
            <li key={c.uid || c.id}>
              <button
                type="button"
                data-wallet-connector={c.id}
                onClick={() => onConnect(c)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-borderSubtle bg-surface px-3 py-2 text-left transition duration-150 hover:border-brand/40 hover:bg-brand/[0.06] active:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
              >
                {c.icon
                  ? <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[28%]">{renderIcon ? renderIcon(c) : <img src={c.icon} alt="" className="h-6 w-6 rounded-md" />}</span>
                  : <BrowserWalletBadge className="h-8 w-8" />}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-textPrimary">{nameOf(c)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// [TR] Masaüstü ve cüzdan-içi tarayıcı: aynı üç satır.
export function WalletChoices({ lang = 'TR', connectors = [], onConnect, renderIcon, win }) {
  const { browser, walletConnect, coinbase } = groupWalletConnectors(connectors, win);
  return (
    <div data-testid="wallet-choices" className="space-y-2.5">
      <BrowserWalletsRow lang={lang} wallets={browser} onConnect={onConnect} renderIcon={renderIcon} />
      <WalletConnectRow lang={lang} connector={walletConnect} onConnect={onConnect} />
      <CoinbaseRow connector={coinbase} onConnect={onConnect} />
    </div>
  );
}
