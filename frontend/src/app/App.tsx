import { Suspense, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, ScrollRestoration } from 'react-router-dom'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { checkAndApplyUpdate } from '../features/pwa/useAppUpdate'
import { KeyboardShortcutsHelp } from '../ui/KeyboardShortcutsHelp'
import { PullToRefreshIndicator } from '../ui/PullToRefreshIndicator'
import {
  EditIcon,
  EditSolidIcon,
  ListBulletIcon,
  ListBulletSolidIcon,
  SettingsIcon,
  SettingsSolidIcon,
} from '../ui/Icons'

// 활성 탭은 채운 아이콘, 나머지는 선 아이콘이다
const tabs = [
  { to: '/todos', label: '계획', Icon: ListBulletIcon, ActiveIcon: ListBulletSolidIcon },
  { to: '/review', label: '회고', Icon: EditIcon, ActiveIcon: EditSolidIcon },
  { to: '/settings', label: '설정', Icon: SettingsIcon, ActiveIcon: SettingsSolidIcon },
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
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <main
        ref={mainRef}
        className="flex-1"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom))' }}
      >
        <div className="mx-auto w-full max-w-lg px-page-x py-page-y">
          {/* 화면 코드를 받는 동안은 비워 둔다. 데이터 로딩은 각 화면의 스켈레톤이 보여 준다 */}
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      <nav
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg items-center justify-around border-t border-border-default bg-surface-card px-card"
        style={{
          height: 'calc(var(--bottom-nav-height) + var(--safe-bottom))',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {tabs.map(({ to, label, Icon, ActiveIcon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-tight rounded-control px-4 py-1 transition-colors ${
                isActive ? 'text-nav-active' : 'text-nav-inactive'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive ? <ActiveIcon className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                <span className={`text-xs ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
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
