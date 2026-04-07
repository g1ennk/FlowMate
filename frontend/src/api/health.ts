import { buildHealthUrl } from './baseUrl'

const HEALTH_TIMEOUT_MS = 5000

export async function checkHealth(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(buildHealthUrl(), { signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
