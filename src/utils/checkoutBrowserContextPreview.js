const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1'])
const VALID_PREVIEW_CONTEXTS = new Set(['facebook_in_app', 'instagram_in_app'])
const STORAGE_KEY = 'brainnel_cod_browser_context_preview'

const isLocalPreviewHost = () => (
  typeof window !== 'undefined' && LOCAL_PREVIEW_HOSTS.has(window.location.hostname)
)

const normalizePreviewContext = (context) => (
  VALID_PREVIEW_CONTEXTS.has(context) ? context : null
)

export const readPreviewBrowserContextFromSearch = (search = '') => {
  if (!isLocalPreviewHost()) return null

  const params = new URLSearchParams(search || window.location.search)
  return normalizePreviewContext(params.get('browser_context'))
}

export const getStoredPreviewBrowserContext = () => {
  if (!isLocalPreviewHost()) return null

  try {
    return normalizePreviewContext(window.localStorage?.getItem(STORAGE_KEY))
  } catch (error) {
    console.warn('browser context preview storage unavailable:', error)
    return null
  }
}

export const getLocalPreviewBrowserContext = (search = '') => (
  readPreviewBrowserContextFromSearch(search) || getStoredPreviewBrowserContext()
)

export const syncLocalPreviewBrowserContextFromSearch = (search = '') => {
  const previewContext = readPreviewBrowserContextFromSearch(search)
  if (!previewContext) return null

  try {
    window.localStorage?.setItem(STORAGE_KEY, previewContext)
  } catch (error) {
    console.warn('browser context preview storage unavailable:', error)
  }

  return previewContext
}

export const getLocalPreviewBrowserContextParam = (search = '', prefix = '&') => {
  const previewContext = getLocalPreviewBrowserContext(search)
  return previewContext
    ? `${prefix}browser_context=${encodeURIComponent(previewContext)}`
    : ''
}
