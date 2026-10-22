import { Check } from 'lucide-react';
import HomeSectionHeader from './HomeSectionHeader';
import HomeVideoCard from './HomeVideoCard';

// [TR] Proje bilgisi (ne, kimin için) ve yanında tanıtım videosu. Mobilde video metnin altına iner.
// [EN] Project info (what, who for) with the intro video beside it; on mobile the video stacks below.
const HomeAbout = ({ about, video }) => (
  <section className="mb-10 md:mb-14 grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start" data-testid="home-about" aria-labelledby="home-about-title">
    <div className="min-w-0">
      <HomeSectionHeader eyebrow={about.eyebrow} title={about.title} id="home-about-title" />
      <div className="space-y-3 text-sm md:text-base text-textSecondary leading-relaxed">
        {about.body.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
      </div>
      <p className="mt-6 mb-3 text-sm font-semibold text-textPrimary">{about.forTitle}</p>
      <ul className="space-y-2">
        {about.forList.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-textSecondary">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-6 grid grid-cols-3 gap-2">
        {about.facts.map((f) => (
          <div key={f.k} className="min-w-0 rounded-xl border border-borderSubtle bg-surface px-3 py-2.5">
            <dt className="text-[10px] font-bold tracking-widest uppercase text-textMuted truncate">{f.k}</dt>
            <dd className="text-sm font-semibold text-textPrimary break-words">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
    <div className="min-w-0">
      <HomeVideoCard content={video} />
      <p className="mt-3 text-xs text-textMuted leading-relaxed">{video.text}</p>
    </div>
  </section>
);

export default HomeAbout;
