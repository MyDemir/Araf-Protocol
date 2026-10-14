import React from 'react';
import { buildApiUrl } from '../apiConfig';
import { fetchWithTimeout } from '../fetchWithTimeout';
import { sanitizeSocialLinks } from '../socialLinks';

// [TR] Footer sosyal linkleri: önce public uçtan (admin yönetimli) çekilir; hata, zaman aşımı ya da boş yanıtta
//      build-time env listesine (envLinks) düşer. Sayfa yüklemesini bloklamaz, hata fırlatmaz. Gelen her link
//      render öncesi aynı katı kuralla (https + allowlist + ...) yeniden süzülür.
// [EN] Footer social links: public endpoint first, env fallback on error/timeout/empty. Always re-validated.

const LINK_CLASS = 'px-3 py-2 rounded-lg border border-borderSubtle text-xs font-semibold text-textSecondary hover:text-textPrimary hover:bg-elevated transition';

// [TR] Env yedeği de uçtan gelenle AYNI doğrulayıcıdan geçer (https + allowlist + punycode + etiket kuralları).
//      NOT: env'de allowlist dışı bir host (ör. özel alan adı) tanımlanırsa gösterilmez; böyle bir host için
//      frontend/src/app/socialLinks.js içindeki SOCIAL_ALLOWED_HOSTS listesine (ve sunucuda gerekirse
//      SOCIAL_LINK_ALLOWED_HOSTS env'ine) eklenmesi gerekir.
const safeEnvLinks = (envLinks) => sanitizeSocialLinks(Array.isArray(envLinks) ? envLinks : []);

export default function FooterSocialLinks({ envLinks = [], timeoutMs = 5000 }) {
  const [remote, setRemote] = React.useState(null);

  React.useEffect(() => {
    const ctrl = new AbortController();
    let alive = true;
    (async () => {
      try {
        const res = await fetchWithTimeout(() => buildApiUrl('social-links'), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          timeoutMs,
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const clean = sanitizeSocialLinks(data?.links);
        if (alive && clean.length > 0) setRemote(clean);
      } catch { /* ağ/zaman aşımı/bozuk gövde: env'e düş */ }
    })();
    return () => { alive = false; ctrl.abort(); };
  }, [timeoutMs]);

  const links = remote || safeEnvLinks(envLinks);
  return (
    <>
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer noopener"
          title={l.host}
          data-testid="footer-social-link"
          className={LINK_CLASS}
        >
          {l.label}
        </a>
      ))}
    </>
  );
}
