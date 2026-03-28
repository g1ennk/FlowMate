import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useThemeStore } from '../store/themeStore'
import { EditIcon, ListBulletIcon, MoonIcon, SettingsIcon, SunIcon } from '../ui/Icons'

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
  const resolved = useThemeStore((s) => s.resolved)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom))' }}
      >
        <div className="mx-auto w-full max-w-lg px-5 py-6">
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

      <button
        type="button"
        onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        className="fixed z-50 flex h-10 w-10 items-center justify-center rounded-full bg-surface-card text-text-secondary shadow-md transition-colors hover:bg-hover-strong"
        style={{
          right: 'max(1rem, var(--safe-right, 0px))',
          bottom: 'calc(var(--bottom-nav-height) + var(--safe-bottom) + 1rem)',
        }}
        aria-label={resolved === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      >
        {resolved === 'dark' ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
      </button>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-border-default bg-surface-card px-4"
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
                isActive ? 'bg-accent-muted text-text-primary' : 'text-border-default'
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
    </div>
  )
}

export default AppLayout
