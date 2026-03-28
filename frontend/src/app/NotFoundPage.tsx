import { Link } from 'react-router-dom'

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
        <svg
          className="h-8 w-8 text-text-tertiary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="mb-1 text-lg font-semibold text-text-primary">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mb-6 text-sm text-text-secondary">
        잘못된 경로이거나 이동된 페이지입니다.
      </p>
      <Link
        to="/todos"
        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
      >
        Todo로 돌아가기
      </Link>
    </div>
  )
}

export default NotFoundPage
