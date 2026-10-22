import { Clock, Store } from 'lucide-react';

// [TR] Hero: başlık, değer önerisi, iki aksiyon ve sorunsuz işlemin kontrat saati. Düğme davranışı eski
//      renderHome ile aynıdır: "Pazara git" setCurrentView('market'), "+ Emir oluştur" openCreateOrder ve
//      newTxBlocked iken kapalı.
// [EN] Hero: headline, value prop, two actions and the contract clock. Button behaviour matches the old renderHome.
const HomeHero = ({ content, onOpenMarket, onCreateOrder, newTxBlocked }) => (
  <section className="mb-8 md:mb-10 grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 lg:gap-10 items-center" data-testid="home-hero" aria-labelledby="home-hero-title">
    <div className="min-w-0">
      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-borderSubtle bg-surface px-3 py-1 text-[11px] font-semibold text-textSecondary mb-5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
        <span className="truncate">{content.eyebrow}</span>
      </p>
      <h1 id="home-hero-title" className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.1] mb-4 text-balance">
        <span className="text-textPrimary">{content.titleLine1}</span>
        <br />
        {/* [TR] Marka yeşili açık zeminde büyük metin için 3:1'in altında kalır (#10b981 / #f8fafc); açık temada
            ikinci satır textSecondary, koyu temada brand. [EN] Brand green fails 3:1 on the light background. */}
        <span className="text-textSecondary [:root[data-theme=night]_&]:text-brand">{content.titleLine2}</span>
      </h1>
      <p className="text-textSecondary text-base md:text-lg max-w-xl leading-relaxed">{content.lead}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button onClick={onOpenMarket} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-black text-sm font-bold hover:opacity-90 transition">
          <Store className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />{content.market}
        </button>
        <button onClick={onCreateOrder} disabled={newTxBlocked} className="px-6 py-3 rounded-xl bg-surface border border-borderStrong text-textPrimary text-sm font-bold hover:bg-elevated transition disabled:opacity-50 disabled:cursor-not-allowed">
          {content.create}
        </button>
      </div>
      <p className="mt-5 text-xs text-textMuted" data-testid="home-status-note">{content.status}</p>
    </div>

    <div className="min-w-0 rounded-2xl border border-borderSubtle bg-surface p-5 shadow-sm" aria-label={content.clockTitle}>
      <div className="flex items-center gap-2 mb-1">
        <Clock className="w-4 h-4 text-brand" strokeWidth={1.8} aria-hidden="true" />
        <p className="text-sm font-semibold text-textPrimary">{content.clockTitle}</p>
      </div>
      <p className="text-xs text-textMuted mb-4">{content.clockSub}</p>
      <ol className="relative space-y-4 before:absolute before:left-[3.25rem] before:top-2 before:bottom-2 before:w-px before:bg-borderStrong">
        {content.clock.map((step, i) => (
          <li key={step.at} className="relative flex items-start gap-3 min-w-0">
            <span className="w-11 shrink-0 pt-0.5 text-right text-[11px] font-bold tabular-nums text-textSecondary">{step.at}</span>
            <span className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-surface ${i === content.clock.length - 1 ? 'bg-brand' : 'bg-textMuted'}`} aria-hidden="true" />
            <span className="min-w-0 text-sm text-textPrimary leading-snug">{step.text}</span>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default HomeHero;
