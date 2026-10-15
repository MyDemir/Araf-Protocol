import { QrCode, Wallet } from 'lucide-react';

// [TR] Cüzdan rozetleri. Hepsi yerel SVG; dış URL'den resim yüklenmez.
//      - Coinbase: @coinbase/wallet-sdk paketindeki resmi logodan (dist/assets/wallet-logo.js, Apache-2.0) alınmıştır.
//      - MetaMask / OKX / Trust: marka rengine yakın, basit şekilli kendi rozetlerimiz (logo taklidi değil).
// [EN] Wallet badges, all local SVG (no external image URLs).
//      - Coinbase: official logo shipped in @coinbase/wallet-sdk (dist/assets/wallet-logo.js, Apache-2.0).
//      - MetaMask / OKX / Trust: simple brand-coloured badges of our own (not logo replicas).

const base = (className) => `shrink-0 rounded-[28%] ${className}`;

export function CoinbaseIcon({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 1024 1024" className={base(className)} aria-hidden="true" focusable="false">
      <rect width="1024" height="1024" fill="#0052FF" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#fff"
        d="M152 512C152 710.823 313.177 872 512 872C710.823 872 872 710.823 872 512C872 313.177 710.823 152 512 152C313.177 152 152 313.177 152 512ZM420 396C406.745 396 396 406.745 396 420V604C396 617.255 406.745 628 420 628H604C617.255 628 628 617.255 628 604V420C628 406.745 617.255 396 604 396H420Z"
      />
    </svg>
  );
}

export function MetaMaskBadge({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 40 40" className={base(className)} aria-hidden="true" focusable="false">
      <rect width="40" height="40" fill="#F6851B" />
      <path d="M11 27V13.5l9 8 9-8V27" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function OkxBadge({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 40 40" className={base(className)} aria-hidden="true" focusable="false">
      <rect width="40" height="40" fill="#000" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill="none" stroke="#fff" strokeOpacity="0.14" />
      <g fill="#fff">
        <rect x="9" y="9" width="6.4" height="6.4" rx="1.2" />
        <rect x="24.6" y="9" width="6.4" height="6.4" rx="1.2" />
        <rect x="16.8" y="16.8" width="6.4" height="6.4" rx="1.2" />
        <rect x="9" y="24.6" width="6.4" height="6.4" rx="1.2" />
        <rect x="24.6" y="24.6" width="6.4" height="6.4" rx="1.2" />
      </g>
    </svg>
  );
}

export function TrustBadge({ className = 'w-10 h-10' }) {
  return (
    <svg viewBox="0 0 40 40" className={base(className)} aria-hidden="true" focusable="false">
      <rect width="40" height="40" fill="#0500FF" />
      <path d="M20 10.5l8 3v6.2c0 5-3.4 8.6-8 10.3-4.6-1.7-8-5.3-8-10.3v-6.2l8-3z" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinejoin="round" />
    </svg>
  );
}

// [TR] Genel tarayıcı cüzdanı rozeti: uygulamanın marka yeşili üstünde cüzdan simgesi.
// [EN] Generic browser-wallet badge: wallet glyph on the app's brand green.
export function BrowserWalletBadge({ className = 'w-10 h-10' }) {
  return (
    <span className={`${base(className)} flex items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-sm`} aria-hidden="true">
      <Wallet className="w-[55%] h-[55%] text-white" strokeWidth={2} />
    </span>
  );
}

// [TR] WalletConnect rozeti: mavi zemin üstünde QR simgesi (resmi logonun kopyası değil).
// [EN] WalletConnect badge: QR glyph on blue (not a replica of the official logo).
export function WalletConnectBadge({ className = 'w-10 h-10' }) {
  return (
    <span className={`${base(className)} flex items-center justify-center bg-[#3B99FC] shadow-sm`} aria-hidden="true">
      <QrCode className="w-[55%] h-[55%] text-white" strokeWidth={2} />
    </span>
  );
}

const BY_LINK_ID = { metamask: MetaMaskBadge, okx: OkxBadge, trust: TrustBadge, coinbase: CoinbaseIcon };

// [TR] Deeplink kimliğine (mobileWallet.js) göre rozet; bilinmeyen kimlikte genel rozet.
// [EN] Badge by deeplink id (mobileWallet.js); generic badge for unknown ids.
export function WalletLinkIcon({ id, className }) {
  const Icon = BY_LINK_ID[id] || BrowserWalletBadge;
  return <Icon className={className} />;
}

// [TR] wagmi bağlayıcısı için rozet: Coinbase SDK ise resmi logo, diğerlerinde genel rozet.
// [EN] Badge for a wagmi connector: official logo for the Coinbase SDK, generic badge otherwise.
export function ConnectorIcon({ connector, className }) {
  if (connector?.id === 'walletConnect' || connector?.type === 'walletConnect') return <WalletConnectBadge className={className} />;
  if (connector?.id === 'coinbaseWalletSDK' || connector?.type === 'coinbaseWallet') return <CoinbaseIcon className={className} />;
  return <BrowserWalletBadge className={className} />;
}
