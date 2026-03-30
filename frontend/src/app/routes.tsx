import { lazy } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import AppLayoutGate from './AppLayoutGate'
import RouteErrorBoundary from './RouteErrorBoundary'

const TodosPage = lazy(() => import('../features/todos/TodosPage'))
const ReviewPage = lazy(() =>
  import('../features/review/ReviewPage').then((module) => ({ default: module.ReviewPage }))
)
const PomodoroSettingsPage = lazy(() => import('../features/settings/PomodoroSettingsPage'))
const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const AuthCallback = lazy(() => import('../features/auth/AuthCallback'))
const NotFoundPage = lazy(() => import('./NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/boarding',
    element: <Navigate to="/login" replace />,
  },
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: <AppLayoutGate />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/todos" replace /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'review/diary', element: <Navigate to="/review" replace /> },
      { path: 'stats', element: <Navigate to="/review" replace /> },
      { path: 'settings', element: <PomodoroSettingsPage /> },
      { path: 'settings/pomodoro', element: <Navigate to="/settings" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
