import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import AppLayoutGate from './AppLayoutGate'

const TodosPage = lazy(() => import('../features/todos/TodosPage'))
const StatsPage = lazy(() =>
  import('../features/todos/StatsPage').then((module) => ({ default: module.StatsPage }))
)
const PomodoroSettingsPage = lazy(() => import('../features/settings/PomodoroSettingsPage'))
const BoardingPage = lazy(() => import('../features/boarding/BoardingPage'))
const NotFoundPage = lazy(() => import('./NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/boarding',
    element: <BoardingPage />,
  },
  {
    path: '/',
    element: <AppLayoutGate />,
    children: [
      { index: true, element: <Navigate to="/todos" replace /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings', element: <PomodoroSettingsPage /> },
      { path: 'settings/pomodoro', element: <Navigate to="/settings" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
