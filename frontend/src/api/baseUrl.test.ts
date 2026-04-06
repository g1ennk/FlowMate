import { describe, it, expect, vi, beforeEach } from 'vitest'

async function loadBaseUrl(envValue: string | undefined) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', envValue ?? '')
  return await import('./baseUrl')
}

describe('buildHealthUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('상대 경로 /api에서 /actuator/health로 변환한다', async () => {
    const { buildHealthUrl } = await loadBaseUrl(undefined) // fallback = '/api'
    expect(buildHealthUrl()).toBe('/actuator/health')
  })

  it('절대 경로 https://api.flowmate.io.kr/api에서 도메인을 보존한다', async () => {
    const { buildHealthUrl } = await loadBaseUrl('https://api.flowmate.io.kr/api')
    expect(buildHealthUrl()).toBe('https://api.flowmate.io.kr/actuator/health')
  })

  it('trailing slash가 있어도 정상 변환한다', async () => {
    const { buildHealthUrl } = await loadBaseUrl('https://api.flowmate.io.kr/api/')
    expect(buildHealthUrl()).toBe('https://api.flowmate.io.kr/actuator/health')
  })
})
