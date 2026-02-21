import { useCallback, useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const getStandaloneState = () => {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standaloneByMedia =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  return standaloneByMedia || nav.standalone === true
}

const getIsIosDevice = () => {
  const ua = window.navigator.userAgent.toLowerCase()
  const platform = window.navigator.platform?.toLowerCase() ?? ''
  const isTouchMac = platform === 'macintel' && window.navigator.maxTouchPoints > 1
  return /iphone|ipad|ipod/.test(ua) || isTouchMac
}

export type PwaInstallResult = 'accepted' | 'dismissed' | 'unsupported'

export function usePwaInstall() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(getStandaloneState)
  const [isInstalled, setIsInstalled] = useState(getStandaloneState)
  const isIos = useMemo(() => getIsIosDevice(), [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setInstallPromptEvent(promptEvent)
    }

    const handleInstalled = () => {
      setInstallPromptEvent(null)
      setIsInstalled(true)
      setIsStandalone(true)
    }

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null

    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      setIsStandalone(event.matches)
      if (event.matches) {
        setIsInstalled(true)
        setInstallPromptEvent(null)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleDisplayModeChange)
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleDisplayModeChange)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      if (!mediaQuery) return
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange)
      } else if (typeof mediaQuery.removeListener === 'function') {
        mediaQuery.removeListener(handleDisplayModeChange)
      }
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<PwaInstallResult> => {
    if (!installPromptEvent) return 'unsupported'
    try {
      await installPromptEvent.prompt()
      const { outcome } = await installPromptEvent.userChoice
      setInstallPromptEvent(null)
      if (outcome === 'accepted') {
        setIsInstalled(true)
        return 'accepted'
      }
      return 'dismissed'
    } catch {
      setInstallPromptEvent(null)
      return 'dismissed'
    }
  }, [installPromptEvent])

  return {
    canInstall: !!installPromptEvent && !isInstalled,
    isInstalled,
    isStandalone,
    isIos,
    promptInstall,
  }
}
