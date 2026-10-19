import { Suspense, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { checkAndApplyUpdate } from '../features/pwa/useAppUpdate'
import { KeyboardShortcutsHelp } from '../ui/KeyboardShortcutsHelp'
import { OfflineBanner } from '../ui/OfflineBanner'
import { PullToRefreshIndicator } from '../ui/PullToRefreshIndicator'
import { EditIcon, ListBulletIcon, SettingsIcon } from '../ui/Icons'

const tabs = [
  {
    to: '/todos',
    label: '계획',
    icon: (active: boolean) => (
      <ListBulletIcon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
    ),
  },
  {
    to: '/review',
    label: '회고',
    icon: (active: boolean) => (
      <EditIcon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
    ),
  },
  {
    to: '/settings',
    label: '설정',
    icon: (active: boolean) => (
      <SettingsIcon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
    ),
  },
]

function AppLayout() {
  const { helpOpen, setHelpOpen } = useKeyboardShortcuts()
  const queryClient = useQueryClient()
  const mainRef = useRef<HTMLElement>(null)
  const refresh = useCallback(
    () => Promise.all([queryClient.invalidateQueries(), checkAndApplyUpdate()]),
    [queryClient],
  )
  const { pullDistance, isRefreshing } = usePullToRefresh(mainRef, refresh)

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <OfflineBanner />
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <main
        ref={mainRef}
        className="flex-1"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom))' }}
      >
        <div className="mx-auto w-full max-w-lg px-page-x py-page-y">
          <Suspense
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center text-sm text-text-tertiary">
                불러오는 중...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-border-default bg-surface-card px-card"
        style={{
          height: 'calc(var(--bottom-nav-height) + var(--safe-bottom))',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 rounded-lg px-4 py-1.5 transition-colors ${
                isActive ? 'bg-accent-muted text-text-primary' : 'text-nav-inactive'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.icon(isActive)}
                <span className={`text-[11px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <KeyboardShortcutsHelp isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* 스크롤 주체는 window다. 탭 이동은 맨 위에서, 뒤로 가기는 이전 위치에서 시작한다 */}
      <ScrollRestoration />
    </div>
  )
}

export default AppLayout
