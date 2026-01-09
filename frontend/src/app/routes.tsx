import { Navigate, createBrowserRouter } from 'react-router-dom'
import AppLayout from './App'
import NotFoundPage from './NotFoundPage'
import TodosPage from '../features/todos/TodosPage'
import PomodoroSettingsPage from '../features/settings/PomodoroSettingsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/todos" replace /> },
      { path: 'todos', element: <TodosPage /> },
      { path: 'settings/pomodoro', element: <PomodoroSettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
