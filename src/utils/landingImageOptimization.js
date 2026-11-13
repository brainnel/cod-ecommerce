// Product and bundle landing pages can load a smaller WebP copy of each uploaded
// image. The copies are made on brainnel-app by /home/admin/image-derivatives
// (systemd timer, every 10 minutes): `<original file name>.w828.webp` next to the
// original, at most 828 px wide. The stored URLs and the original files stay as
// they are, so the app, the admin console, Meta ads and checkout are untouched.

// Share of devices that get the WebP copies. The others get today's behaviour.
export const LANDING_IMAGE_WEBP_PERCENT = 10
// Hash salt. It differs from every other experiment, so this rollout is
// independent of them. Buckets below the percentage are in; raising the
// percentage keeps every device that is already in.
export const LANDING_IMAGE_ROLLOUT = 'landing_img_webp828_20261113'
export const LANDING_IMAGE_WEBP = 'webp828'
export const LANDING_IMAGE_ORIGINAL = 'orig'

const UPLOADS_PREFIX = 'https://api.brainnel.com/admin/static/uploads/'
const DERIVATIVE_SUFFIX = '.w828.webp'
// One file name directly in the uploads directory: .jpg, .jpeg or .png.
const SOURCE_FILE_NAME = /^[^./?#%][^/?#%]*\.(?:jpe?g|png)$/i

// Maps an uploads image URL to its WebP copy. Every other value is returned
// unchanged: other hosts, data URIs, URLs that are already WebP, non-strings.
export const toLandingWebpUrl = (url) => {
  if (typeof url !== 'string' || !url.startsWith(UPLOADS_PREFIX)) return url
  return SOURCE_FILE_NAME.test(url.slice(UPLOADS_PREFIX.length)) ? `${url}${DERIVATIVE_SUFFIX}` : url
}

export const getLandingImageBucket = (deviceId) => {
  if (typeof deviceId !== 'string' || !deviceId.trim()) return null
  const text = `${LANDING_IMAGE_ROLLOUT}:${deviceId}`
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 100
}

const keepOriginal = (url) => url

// `variant` is reported as `img_opt` on product_landing_view; `resolve` gives the
// URL a landing image should try first for this device.
export const getLandingImageOptimization = ({ deviceId, percent = LANDING_IMAGE_WEBP_PERCENT } = {}) => {
  const bucket = getLandingImageBucket(deviceId)
  const enabled = bucket !== null && bucket < percent
  return {
    bucket,
    enabled,
    variant: enabled ? LANDING_IMAGE_WEBP : LANDING_IMAGE_ORIGINAL,
    resolve: enabled ? toLandingWebpUrl : keepOriginal
  }
}

// Which URL an <img> shows: the optimized one until it has failed once, then the
// original for good. The original is never swapped back or retried.
export const pickLandingImageSrc = ({ src, optimizedSrc, failedSrc }) => (
  optimizedSrc && optimizedSrc !== src && optimizedSrc !== failedSrc ? optimizedSrc : src
)
