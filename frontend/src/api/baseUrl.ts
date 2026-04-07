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

export function buildHealthUrl() {
  // apiBaseUrl: '/api' 또는 'https://api.flowmate.io.kr/api'
  // /actuator/health는 nginx에서 별도 location으로 라우팅됨
  return apiBaseUrl.replace(/\/api$/, '') + '/actuator/health'
}

export { apiBaseUrl }
