import { Navigate, useNavigate } from 'react-router-dom'
import { CheckCircleIcon } from '../../ui/Icons'
import { getAuthMode, setAuthMode } from '../../lib/auth'
import { getOnboardingSeen } from '../../lib/onboarding'

function LoginPage() {
  const navigate = useNavigate()
  const authMode = getAuthMode()
  const onboardingSeen = getOnboardingSeen()

  if (!onboardingSeen) {
    return <Navigate to="/boarding" replace />
  }

  if (authMode) {
    return <Navigate to="/todos" replace />
  }

  const handleGuestStart = () => {
    setAuthMode('guest')
    navigate('/todos', { replace: true })
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-2 h-56 w-56 rounded-full bg-emerald-50/90 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight text-gray-900">
            <span className="text-emerald-500">Flow</span>Mate
          </div>
          <div className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-semibold text-gray-500">
            Login
          </div>
        </header>

        <main className="flex flex-1 items-center">
          <div className="w-full space-y-5">
            <div className="space-y-2 text-center">
              <h1 className="break-keep text-2xl font-semibold tracking-tight text-gray-900">
                시작할 방식을 선택하세요
              </h1>
              <p className="mx-auto max-w-md break-keep text-sm leading-6 text-gray-500">
                카카오 로그인은 준비 중입니다. 지금은 게스트로 바로 시작할 수 있어요.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled
                aria-label="카카오 로그인 (개발 예정)"
                className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-left opacity-70"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FEE500] text-sm font-bold text-[#3C1E1E]">
                    K
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">카카오로 계속하기</p>
                    <p className="text-xs text-gray-400">개발 예정</p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-400">
                  준비 중
                </span>
              </button>

              <button
                type="button"
                onClick={handleGuestStart}
                className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <CheckCircleIcon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">게스트로 계속하기</p>
                    <p className="text-xs text-gray-500">지금 바로 사용 시작</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-600">계속</span>
              </button>
            </div>

            <div className="rounded-xl bg-gray-50 px-3 py-2 text-center text-xs leading-5 text-gray-500 break-keep">
              게스트 모드는 이 기기에 데이터가 저장됩니다.
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default LoginPage
