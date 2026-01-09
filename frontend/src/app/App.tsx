import { NavLink, Outlet } from 'react-router-dom'
import { CheckCircleIcon, SettingsIcon } from '../ui/Icons'

const tabs = [
  {
    to: '/todos',
    label: 'Todo',
    icon: (active: boolean) => (
      <CheckCircleIcon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
    ),
  },
  {
    to: '/settings/pomodoro',
    label: '설정',
    icon: (active: boolean) => (
      <SettingsIcon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
    ),
  },
]

function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <main className="flex-1 overflow-y-auto pb-16">
        <div className="mx-auto w-full max-w-lg px-5 py-6">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white px-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 rounded-xl px-6 py-2 transition-colors ${
                isActive ? 'text-emerald-600' : 'text-gray-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {tab.icon(isActive)}
                <span className="text-[10px] font-medium">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default AppLayout
