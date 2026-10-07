/* global process */
// [TR] Build-time Farcaster / Base mini app meta + manifest üretici. Mutlak URL'ler tek ayardan (VITE_PUBLIC_URL) gelir.
// [EN] Build-time Farcaster / Base mini app meta + manifest generator. All absolute URLs derive from VITE_PUBLIC_URL.

export const DEFAULT_BASE_APP_ID = '69f120f1ccd925ae04c3ba5f'
const NAME = 'Araf Protocol'
const BUTTON_TITLE = 'Launch Araf'
const SPLASH_BG = '#060608'
const OG_TITLE = 'Araf Protocol | P2P Escrow'
const OG_DESC = 'Non-custodial, oracle-free P2P escrow on Base.'

export const normalizePublicUrl = (raw) => {
  const v = String(raw || '').trim().replace(/\/+$/, '')
  if (!v) return ''
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return ''
    return `${u.origin}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return ''
  }
}

const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// [TR] Vite tag serileştirmesi öznitelikteki " karakterini kaçırmaz (JSON içerikli fc:* bozulur); HTML'i kendimiz üretiriz.
export const renderMetaTags = (tags) => tags
  .map((t) => `    <meta ${Object.entries(t.attrs).map(([k, v]) => `${k}="${escAttr(v)}"`).join(' ')} />`)
  .join('\n')

export const buildFarcasterManifest = ({ publicUrl, accountAssociation } = {}) => {
  if (!publicUrl) return null
  const fields = {
    version: '1',
    name: NAME,
    iconUrl: `${publicUrl}/icon.png`,
    homeUrl: publicUrl,
    imageUrl: `${publicUrl}/og-image.png`,
    buttonTitle: BUTTON_TITLE,
    splashImageUrl: `${publicUrl}/splash.png`,
    splashBackgroundColor: SPLASH_BG,
    subtitle: 'Escrow on Base',
    tagline: 'Trust the time, not the oracle',
    description: 'Non-custodial P2P escrow built for Base.',
    primaryCategory: 'finance',
    tags: ['escrow', 'p2p', 'base'],
    ogTitle: 'Araf Protocol',
    ogDescription: 'Non-custodial P2P escrow on Base.',
    ogImageUrl: `${publicUrl}/og-image.png`,
  }
  const out = {}
  if (accountAssociation) out.accountAssociation = accountAssociation
  out.miniapp = { ...fields }
  out.frame = { ...fields }
  return out
}

export const buildMetaTags = ({ publicUrl, baseAppId }) => {
  const img = publicUrl ? `${publicUrl}/og-image.png` : '/og-image.png'
  const tags = []
  const meta = (attr, key, content) => tags.push({ tag: 'meta', attrs: { [attr]: key, content }, injectTo: 'head' })
  meta('name', 'base:app_id', baseAppId)
  meta('property', 'og:site_name', NAME)
  meta('property', 'og:title', OG_TITLE)
  meta('property', 'og:description', OG_DESC)
  meta('property', 'og:type', 'website')
  if (publicUrl) meta('property', 'og:url', `${publicUrl}/`)
  meta('property', 'og:image', img)
  meta('name', 'twitter:card', 'summary_large_image')
  meta('name', 'twitter:title', OG_TITLE)
  meta('name', 'twitter:description', OG_DESC)
  meta('name', 'twitter:image', img)
  if (publicUrl) {
    const home = `${publicUrl}/`
    meta('name', 'fc:miniapp', JSON.stringify({
      version: '1',
      imageUrl: img,
      button: {
        title: BUTTON_TITLE,
        action: { type: 'launch_frame', name: NAME, url: home, splashImageUrl: `${publicUrl}/splash.png`, splashBackgroundColor: SPLASH_BG },
      },
    }))
    meta('name', 'fc:frame', JSON.stringify({
      version: '1',
      image: img,
      buttons: [{ label: BUTTON_TITLE, action: 'link', target: home }],
      postUrl: home,
    }))
    meta('name', 'fc:frame:image', img)
    meta('name', 'fc:frame:button:1', BUTTON_TITLE)
    meta('name', 'fc:frame:button:1:action', 'link')
    meta('name', 'fc:frame:button:1:target', home)
  }
  return tags
}

export const readAccountAssociation = (env) => {
  const header = (env.FARCASTER_ACCOUNT_ASSOCIATION_HEADER || '').trim()
  const payload = (env.FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD || '').trim()
  const signature = (env.FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE || '').trim()
  return header && payload && signature ? { header, payload, signature } : null
}

export default function miniappMeta({ env = process.env, warn = (m) => console.warn(m) } = {}) {
  const publicUrl = normalizePublicUrl(env.VITE_PUBLIC_URL)
  const baseAppId = (env.VITE_BASE_APP_ID || '').trim() || DEFAULT_BASE_APP_ID
  const accountAssociation = readAccountAssociation(env)
  return {
    name: 'araf-miniapp-meta',
    configResolved(config) {
      if (config.command !== 'build') return
      if (!publicUrl) {
        warn('[miniapp-meta] VITE_PUBLIC_URL not set: fc:miniapp/fc:frame tags and .well-known/farcaster.json skipped; og/twitter images use relative paths.')
      } else if (!accountAssociation) {
        warn('[miniapp-meta] FARCASTER_ACCOUNT_ASSOCIATION_* not set: farcaster.json emitted without accountAssociation (generate the signature for the new domain).')
      }
    },
    transformIndexHtml(html) {
      return html.replace('</head>', () => `${renderMetaTags(buildMetaTags({ publicUrl, baseAppId }))}\n  </head>`)
    },
    generateBundle() {
      const manifest = buildFarcasterManifest({ publicUrl, accountAssociation })
      if (!manifest) return
      this.emitFile({ type: 'asset', fileName: '.well-known/farcaster.json', source: `${JSON.stringify(manifest, null, 2)}\n` })
    },
  }
}
