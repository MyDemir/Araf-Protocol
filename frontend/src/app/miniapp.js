// [TR] Farcaster / Base mini app köprüsü. SDK lazy yüklenir (ana paket şişmez); hatalar yutulur, açılış asla bloklanmaz.
// [EN] Farcaster / Base mini app bridge. SDK is lazy-loaded (main bundle stays small); errors are swallowed, boot is never blocked.

const defaultImporter = () => import('@farcaster/miniapp-sdk')

export const isInMiniApp = async (importer = defaultImporter, logger = console) => {
  try {
    const { sdk } = await importer()
    return (await sdk.isInMiniApp()) === true
  } catch (err) {
    logger.warn('[miniapp] SDK unavailable; continuing as a regular web app', err)
    return false
  }
}

// [TR] Mini app içindeyse splash ekranını kapatır (ready). Dışındaysa hiçbir şey yapmaz.
export const signalMiniAppReady = async (importer = defaultImporter, logger = console) => {
  try {
    const { sdk } = await importer()
    if ((await sdk.isInMiniApp()) !== true) return false
    await sdk.actions.ready()
    return true
  } catch (err) {
    logger.warn('[miniapp] ready() failed; continuing', err)
    return false
  }
}

// [TR] İlk render'dan sonra çağrılır; await edilmez.
export const scheduleMiniAppReady = (importer, logger) => {
  const run = () => { signalMiniAppReady(importer, logger) }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(run, 0))
  else setTimeout(run, 0)
}
