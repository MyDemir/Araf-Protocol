import { Banknote, CircleCheck, Flame, ListPlus } from 'lucide-react';
import HomeSectionHeader from './HomeSectionHeader';

const ICONS = { order: ListPlus, payment: Banknote, release: CircleCheck, dispute: Flame };

// [TR] "Nasıl çalışır": dört adım (metinler eski renderHome ile aynı, homeContent.how).
// [EN] "How it works": four steps (copy unchanged, from homeContent.how).
const HomeHowItWorks = ({ content }) => (
  <section className="min-w-0 bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6" data-testid="home-how-it-works" aria-labelledby="home-how-title">
    <HomeSectionHeader eyebrow={content.eyebrow} title={content.title} id="home-how-title" className="!mb-4" />
    <ol className="space-y-3">
      {content.steps.map((step, i) => {
        const Icon = ICONS[step.key] || ListPlus;
        return (
          <li key={step.key} className="flex gap-3">
            <span className="shrink-0 w-8 h-8 rounded-lg bg-elevated border border-borderSubtle flex items-center justify-center text-textSecondary">
              <Icon className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-textPrimary"><span className="text-textMuted tabular-nums mr-1">{i + 1}.</span>{step.title}</p>
              <p className="text-xs md:text-sm text-textSecondary leading-relaxed">{step.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  </section>
);

export default HomeHowItWorks;
