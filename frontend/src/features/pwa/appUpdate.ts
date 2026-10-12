/**
 * 새 배포 감지 + 적용.
 * iOS standalone PWA는 메모리에 오래 살아 있고 SPA라 내비게이션이 없어서,
 * 브라우저가 서비스 워커 업데이트를 확인할 기회가 없다. 직접 update()를 호출한다.
 * sw.js는 skipWaiting + clientsClaim이라 새 버전이 설치되면 바로 controllerchange가 온다.
 */
export function createAppUpdater(container: ServiceWorkerContainer | undefined, reload: () => void) {
  let hadController = !!container?.controller
  let pending = false
  let reloading = false

  container?.addEventListener('controllerchange', () => {
    // 최초 설치(컨트롤러 없음 → 생김)는 새 버전이 아니다
    if (hadController) pending = true
    hadController = true
  })

  const waitForControllerChange = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        container?.removeEventListener('controllerchange', done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      container?.addEventListener('controllerchange', done)
    })

  return {
    hasPendingUpdate: () => pending,

    /** 새 버전을 확인한다. waitMs를 주면 설치 중인 새 버전의 활성화까지 기다린다. */
    async check({ waitMs = 0 }: { waitMs?: number } = {}) {
      if (!container) return pending
      try {
        const registration = await container.getRegistration()
        if (!registration) return pending
        await registration.update()
        if (waitMs > 0 && !pending && (registration.installing || registration.waiting)) {
          await waitForControllerChange(waitMs)
        }
      } catch {
        // 오프라인 등 — 다음 기회에 다시 확인한다
      }
      return pending
    },

    /** 대기 중인 새 버전이 있으면 reload한다. */
    applyUpdate() {
      if (!pending || reloading) return false
      reloading = true
      reload()
      return true
    },
  }
}

export const appUpdater = createAppUpdater(
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  () => window.location.reload(),
)
