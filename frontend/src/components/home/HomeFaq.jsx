import { ChevronDown } from 'lucide-react';
import HomeSectionHeader from './HomeSectionHeader';

// [TR] SSS: öğeler AppViews.buildFaqItems'tan gelir (kontrat sabitleri + kontrattan okunan ücret).
// [EN] FAQ: items come from AppViews.buildFaqItems (contract constants + fee read from the contract).
const HomeFaq = ({ content, items }) => (
  <section className="min-w-0 bg-surface border border-borderSubtle rounded-2xl p-5 md:p-6" data-testid="home-faq" aria-labelledby="home-faq-title">
    <HomeSectionHeader eyebrow={content.eyebrow} title={content.title} id="home-faq-title" tone="muted" className="!mb-4" />
    <div className="min-w-0 divide-y divide-borderSubtle">
      {items.map((item) => (
        <details key={item.q} className="group py-3 first:pt-0">
          <summary className="cursor-pointer list-none text-sm font-semibold text-textPrimary flex items-center justify-between gap-3">
            {item.q}
            <ChevronDown className="w-4 h-4 shrink-0 text-textMuted group-open:rotate-180 transition" strokeWidth={1.8} aria-hidden="true" />
          </summary>
          <p className="text-xs md:text-sm text-textSecondary mt-2 leading-relaxed">{item.a}</p>
        </details>
      ))}
    </div>
  </section>
);

export default HomeFaq;
