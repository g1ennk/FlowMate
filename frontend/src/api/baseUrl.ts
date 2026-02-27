function normalizeBaseUrl(value?: string) {
  const fallback = '/api'
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, '')
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/$/, '')
}

const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

export function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

export { apiBaseUrl }
