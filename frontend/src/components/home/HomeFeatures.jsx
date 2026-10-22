import { BadgeCheck, BellRing, CirclePause, Coins, Flame, Handshake, KeyRound, ShieldCheck, Timer } from 'lucide-react';
import HomeSectionHeader from './HomeSectionHeader';

const ICONS = {
  custody: ShieldCheck,
  bond: Coins,
  window: Timer,
  ping: BellRing,
  bleed: Flame,
  settle: Handshake,
  tier: BadgeCheck,
  pause: CirclePause,
  owner: KeyRound,
};

// [TR] Kontrattan doğrulanabilen özellikler ızgarası (kaynak satırları homeContent.js'te).
// [EN] Grid of contract-verifiable features (source lines live in homeContent.js).
const HomeFeatures = ({ content }) => (
  <section className="mb-10 md:mb-14 min-w-0" data-testid="home-features" aria-labelledby="home-features-title">
    <HomeSectionHeader eyebrow={content.eyebrow} title={content.title} id="home-features-title" />
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {content.items.map((item) => {
        const Icon = ICONS[item.key] || ShieldCheck;
        return (
          <li key={item.key} className="min-w-0 rounded-2xl border border-borderSubtle bg-surface p-5 transition hover:border-borderStrong">
            <div className="mb-2 flex items-center gap-3 sm:mb-3 sm:flex-col sm:items-start">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.key === 'bleed' ? 'bg-danger/10 text-danger' : 'bg-elevated text-textSecondary'} border border-borderSubtle`}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="min-w-0 text-sm font-bold text-textPrimary">{item.title}</p>
            </div>
            <p className="text-sm text-textSecondary leading-relaxed">{item.text}</p>
          </li>
        );
      })}
    </ul>
  </section>
);

export default HomeFeatures;
