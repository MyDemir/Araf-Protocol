import { Ban, FileCode2, Flame, Hourglass } from 'lucide-react';

const POINT_ICONS = [Ban, FileCode2, Flame];
const BLEED_MAX_HOURS = 240; // ArafEscrow.sol:273 MAX_BLEEDING
const BLEED_TONES = ['bg-elevated', 'bg-warning/40', 'bg-danger/60'];

// [TR] Felsefe: "Zamana Güven, Hakeme Değil". Üç ilke ve itirazdaki eriyen kasanın zaman çizgisi (orantılı çubuk).
// [EN] Philosophy: three principles and a proportional timeline of the bleeding escrow.
const HomePhilosophy = ({ content }) => (
  <section className="mb-10 md:mb-14 min-w-0 overflow-hidden rounded-3xl border border-borderSubtle bg-surface" data-testid="home-philosophy" aria-labelledby="home-philosophy-title">
    <div className="p-6 md:p-10">
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-brand mb-3">{content.eyebrow}</p>
      <h2 id="home-philosophy-title" className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-textPrimary text-balance">{content.motto}</h2>
      <p className="mt-1 text-sm md:text-base italic text-textMuted">{content.mottoAlt}</p>
      <p className="mt-4 max-w-2xl text-sm md:text-base text-textSecondary leading-relaxed">{content.lead}</p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {content.points.map((pt, i) => {
          const Icon = POINT_ICONS[i] || Ban;
          return (
            <div key={pt.title} className="min-w-0 rounded-2xl border border-borderSubtle bg-elevated p-5">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <p className="text-base font-bold text-textPrimary mb-1">{pt.title}</p>
              <p className="text-sm text-textSecondary leading-relaxed">{pt.text}</p>
            </div>
          );
        })}
      </div>
    </div>

    <div className="border-t border-borderSubtle bg-elevated/60 p-6 md:p-10" data-testid="home-bleed-timeline">
      <div className="flex items-center gap-2 mb-1">
        <Hourglass className="h-4 w-4 text-danger" strokeWidth={1.8} aria-hidden="true" />
        <p className="text-sm font-semibold text-textPrimary">{content.bleedTitle}</p>
      </div>
      <p className="text-xs text-textMuted mb-5">{content.bleedSub}</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-borderSubtle" aria-hidden="true">
        {content.bleed.map((seg, i) => (
          <span key={seg.label} className={BLEED_TONES[i]} style={{ width: `${((seg.to - seg.from) / BLEED_MAX_HOURS) * 100}%` }} />
        ))}
      </div>
      <ol className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {content.bleed.map((seg, i) => (
          <li key={seg.label} className="min-w-0 flex items-start gap-2.5">
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-borderStrong ${BLEED_TONES[i]}`} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs font-bold tabular-nums text-textPrimary">{seg.label}</span>
              <span className="block text-xs text-textSecondary leading-snug">{seg.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 text-xs font-semibold text-danger">
        <Flame className="h-3.5 w-3.5 shrink-0 mt-px" strokeWidth={2} aria-hidden="true" />{content.bleedEnd}
      </p>
    </div>
  </section>
);

export default HomePhilosophy;
