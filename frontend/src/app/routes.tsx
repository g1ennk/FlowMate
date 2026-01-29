import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import AppLayout from './App'

const TodosPage = lazy(() => import('../features/todos/TodosPage'))
const StatsPage = lazy(() =>
  import('../features/todos/StatsPage').then((module) => ({ default: module.StatsPage }))
)
const PomodoroSettingsPage = lazy(() => import('../features/settings/PomodoroSettingsPage'))
const NotFoundPage = lazy(() => import('./NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/todos" replace /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings/pomodoro', element: <PomodoroSettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
