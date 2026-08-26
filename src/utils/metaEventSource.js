export const DEFAULT_META_SITE_ORIGIN = 'https://www.brainnel.com'

export const ALLOWED_META_SITE_ORIGINS = new Set([
  'https://brainnel.com',
  'https://www.brainnel.com',
  'https://brainnel-vite.com',
  'https://www.brainnel-vite.com'
])

export const resolveMetaSiteOrigin = (candidateOrigin) => {
  try {
    const parsed = new URL(candidateOrigin)
    const hasCredentials = Boolean(parsed.username || parsed.password)
    return !hasCredentials && ALLOWED_META_SITE_ORIGINS.has(parsed.origin)
      ? parsed.origin
      : DEFAULT_META_SITE_ORIGIN
  } catch {
    return DEFAULT_META_SITE_ORIGIN
  }
}

const getRuntimeLocation = () => (
  typeof window !== 'undefined' ? window.location : null
)

export const buildMetaEventSourceUrl = (productId, locationLike = getRuntimeLocation()) => {
  const siteOrigin = resolveMetaSiteOrigin(locationLike?.origin)
  const rawId = productId?.toString().trim()

  if (!rawId) {
    try {
      const currentUrl = new URL(locationLike?.href)
      if (resolveMetaSiteOrigin(currentUrl.origin) === currentUrl.origin) {
        currentUrl.hash = ''
        return currentUrl.href
      }
    } catch {
      // Fall through to the canonical default page for an invalid runtime URL.
    }
    return `${siteOrigin}/`
  }

  const bundleMatch = rawId.match(/^bundle:(\d+)$/)
  if (bundleMatch) {
    return `${siteOrigin}/bundle/${bundleMatch[1]}`
  }

  if (/^https?:\/\//i.test(rawId)) {
    try {
      const productPath = new URL(rawId).pathname.match(/^\/product\/[^/?#]+/)?.[0]
      if (productPath) {
        return `${siteOrigin}${productPath}`
      }
    } catch {
      // Invalid absolute IDs are handled as a normal product identifier below.
    }
  }

  const productPath = rawId.startsWith('/product/') ? rawId : `/product/${rawId}`
  const cleanPath = productPath.split('?')[0].split('#')[0]
  return `${siteOrigin}${cleanPath}`
}
