import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { HOME_VIDEO_EMBED_URL, HOME_VIDEO_URL } from '../../app/homeContent';

// [TR] Tanıtım videosu: önce poster (düğme), tıklanınca Vimeo oynatıcısı (iframe, dnt=1). Tıklanmadan Vimeo'ya hiçbir
//      istek gitmez; harici görsel yüklenmez (poster CSS). iframe için CSP'de `frame-src https://player.vimeo.com`
//      gerekir (frontend/vercel.json). URL'ler tek yerde: homeContent.
// [EN] Intro video: poster button first, Vimeo player (iframe, dnt=1) after click. No request to Vimeo before the click.
const HomeVideoCard = ({ content, embedUrl = HOME_VIDEO_EMBED_URL, href = HOME_VIDEO_URL }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="min-w-0" data-testid="home-video">
      <div className="relative overflow-hidden rounded-2xl border border-borderSubtle bg-elevated aspect-video">
        {playing ? (
          <iframe
            src={embedUrl}
            title={content.iframeTitle}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
            data-testid="home-video-player"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={content.playAria}
            data-testid="home-video-play"
            className="group absolute inset-0 block h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            {/* [TR] Dekoratif poster: ızgara + saat halkaları. [EN] Decorative poster: grid + clock rings. */}
            <span className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--color-border-subtle)_1px,transparent_1px),linear-gradient(90deg,var(--color-border-subtle)_1px,transparent_1px)] [background-size:28px_28px]" aria-hidden="true" />
            <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" aria-hidden="true" />
            <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full border border-brand/20" aria-hidden="true" />
            <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full border border-brand/10" aria-hidden="true" />
            <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex h-16 w-16 items-center justify-center rounded-full bg-brand text-black shadow-lg transition group-hover:scale-105" aria-hidden="true">
              <Play className="h-7 w-7 translate-x-0.5" strokeWidth={2} fill="currentColor" />
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold tracking-[0.2em] uppercase text-brand">{content.eyebrow}</span>
                <span className="block truncate text-base font-bold text-textPrimary">{content.title}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-borderStrong bg-surface px-3 py-1.5 text-xs font-semibold text-textPrimary" aria-hidden="true">
                <Play className="h-3.5 w-3.5" strokeWidth={2} />{content.cta}
              </span>
            </span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 flex-1 text-xs text-textMuted leading-relaxed">{content.text}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline" data-testid="home-video-link">
          {content.openLink}<ExternalLink className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
};

export default HomeVideoCard;
