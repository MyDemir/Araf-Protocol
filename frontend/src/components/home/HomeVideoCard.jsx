import { ExternalLink, Play } from 'lucide-react';
import { HOME_VIDEO_URL } from '../../app/homeContent';

// [TR] Tanıtım videosu poster kartı. CSP frame-src içermediği için iframe yok; kart videoyu Vimeo'da yeni sekmede
//      açar. Harici görsel yüklenmez: poster tamamen CSS'tir. URL tek yerde (homeContent.HOME_VIDEO_URL).
// [EN] Intro video poster card. No iframe (CSP has no frame-src); it opens Vimeo in a new tab. No external image.
const HomeVideoCard = ({ content, href = HOME_VIDEO_URL }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={content.aria}
    data-testid="home-video"
    className="group relative block min-w-0 overflow-hidden rounded-2xl border border-borderSubtle bg-elevated aspect-video focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
  >
    {/* [TR] Dekoratif poster: ızgara + saat halkaları (kontratın saati). [EN] Decorative poster: grid + clock rings. */}
    <span className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--color-border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--color-border-subtle)_1px,transparent_1px)] [background-size:28px_28px]" aria-hidden="true" />
    <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" aria-hidden="true" />
    <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full border border-brand/20" aria-hidden="true" />
    <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full border border-brand/10" aria-hidden="true" />
    <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-black shadow-lg transition group-hover:scale-105">
      <Play className="h-7 w-7 translate-x-0.5" strokeWidth={2} fill="currentColor" aria-hidden="true" />
    </span>
    <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand">{content.eyebrow}</span>
        <span className="block truncate text-base font-bold text-textPrimary">{content.title}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-borderStrong bg-surface px-3 py-1.5 text-xs font-semibold text-textPrimary">
        {content.cta}<ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </span>
    </span>
  </a>
);

export default HomeVideoCard;
