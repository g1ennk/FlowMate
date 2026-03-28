import { Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { buildApiUrl } from '../../api/baseUrl'
import { useAuthStore } from '../../store/authStore'
import { setOnboardingSeen } from '../../lib/onboarding'

/* ── CSS Mini Previews ─────────────────────────────── */

const PLAN_ITEMS = [
  { done: true, label: '프로젝트 기획서 작성' },
  { done: true, label: '디자인 시안 피드백' },
  { done: false, label: 'UI 컴포넌트 구현' },
] as const

const REVIEW_STATS = [
  { label: '집중', value: '2h 30m' },
  { label: 'Flow', value: '5회' },
  { label: '완료', value: '8개' },
] as const

const REVIEW_BARS = [30, 60, 45, 80, 55, 70, 35]
const REVIEW_DAYS = ['월', '화', '수', '목', '금', '토', '일']

function MiniPlanPreview() {
  return (
    <div className="space-y-1.5">
      {PLAN_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-2 rounded-lg bg-surface-base px-2.5 py-2">
          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            item.done ? 'border-accent bg-accent' : 'border-border-strong'
          }`}>
            {item.done && (
              <svg className="h-2 w-2 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M2 6l3 3 5-5" /></svg>
            )}
          </span>
          <span className={`text-[10px] ${item.done ? 'text-text-disabled line-through' : 'text-text-primary'}`}>
            {item.label}
          </span>
          {!item.done && (
            <span className="ml-auto text-[8px] font-medium text-accent">오후</span>
          )}
        </div>
      ))}
    </div>
  )
}

function MiniTimerPreview() {
  return (
    <div className="flex flex-col items-center rounded-xl bg-timer-focus-bg px-4 py-4">
      <span className="text-[9px] font-semibold text-accent">Flow</span>
      <span className="mt-0.5 text-3xl font-light tabular-nums tracking-tight text-timer-focus-text">18:42</span>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="relative h-1.5 w-5 overflow-hidden rounded-full bg-timer-btn">
          <span className="absolute left-0 top-0 h-full w-3/5 rounded-full bg-accent" />
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-timer-btn" />
      </div>
    </div>
  )
}

function MiniReviewPreview() {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {REVIEW_STATS.map((s) => (
          <div key={s.label} className="flex-1 rounded-lg bg-surface-base px-2 py-1.5">
            <span className="text-[7px] text-text-tertiary">{s.label}</span>
            <p className="text-[11px] font-bold text-accent">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-1 px-0.5">
        {REVIEW_BARS.map((h, i) => (
          <div key={REVIEW_DAYS[i]} className="flex flex-1 flex-col items-center gap-0.5">
            <div className="w-full rounded-sm bg-accent/50" style={{ height: `${h * 0.32}px` }} />
            <span className="text-[7px] text-text-tertiary">{REVIEW_DAYS[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Steps Data ─────────────────────────────────────── */

const STEPS = [
  { num: '01', label: '계획', desc: '할 일을 정리하고 하루를 설계해요', preview: MiniPlanPreview },
  { num: '02', label: '집중', desc: '타이머와 함께 몰입해서 실행해요', preview: MiniTimerPreview },
  { num: '03', label: '회고', desc: '기록으로 오늘을 돌아봐요', preview: MiniReviewPreview },
] as const

/* ── Page ───────────────────────────────────────────── */

function LoginPage() {
  const navigate = useNavigate()
  const authState = useAuthStore((s) => s.state)
  const initialized = useAuthStore((s) => s.initialized)

  if (!initialized) return null

  if (authState?.type === 'member') {
    return <Navigate to="/todos" replace />
  }

  const handleGuestStart = () => {
    setOnboardingSeen(true)
    navigate('/todos', { replace: true })
    if (!localStorage.getItem('flowmate/ui/guest-notice-seen')) {
      localStorage.setItem('flowmate/ui/guest-notice-seen', '1')
      setTimeout(() => toast('게스트 데이터는 이 기기에만 저장돼요', { id: 'guest-notice', duration: 4000 }), 500)
    }
  }

  const handleKakaoLogin = async () => {
    try {
      const res = await fetch(buildApiUrl('/auth/kakao/authorize-url'))
      if (!res.ok) throw new Error('인증 URL 발급 실패')
      const data = await res.json()
      sessionStorage.setItem('oauth_state', data.state)
      sessionStorage.setItem('oauth_provider', 'kakao')
      setOnboardingSeen(true)
      window.location.href = data.authorizeUrl
    } catch (e) {
      console.error('[LoginPage] 카카오 로그인 시작 실패', e)
      toast.error('카카오 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-between px-6 py-10">

        <div>
          <header className="pt-4">
            <h1 className="text-3xl font-bold tracking-tight text-text-primary">
              <span className="text-accent">Flow</span>Mate
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              계획부터 회고까지, 하나의 흐름으로 완성하는 하루
            </p>
          </header>

          <ol className="mt-8 space-y-3">
            {STEPS.map((step, i) => {
              const Preview = step.preview
              return (
                <li
                  key={step.label}
                  className="animate-fade-in-up overflow-hidden rounded-2xl bg-surface-card p-card shadow-sm"
                  style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-accent">{step.num}</span>
                    <span className="text-sm font-semibold text-text-primary">{step.label}</span>
                    <span className="ml-auto text-[11px] text-text-secondary">{step.desc}</span>
                  </div>
                  <Preview />
                </li>
              )
            })}
          </ol>
        </div>

        <footer className="mt-5 space-y-3">
          <button
            type="button"
            onClick={handleKakaoLogin}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#FEE500] text-sm font-semibold text-[#3C1E1E] transition-opacity active:opacity-80"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C6.48 3 2 6.36 2 10.5c0 2.63 1.74 4.95 4.38 6.3l-1.12 4.08c-.1.36.3.65.6.44l4.84-3.2c.42.04.85.07 1.3.07 5.52 0 10-3.36 10-7.5S17.52 3 12 3z" />
            </svg>
            카카오로 시작하기
          </button>

          <button
            type="button"
            onClick={handleGuestStart}
            className="flex h-13 w-full items-center justify-center rounded-2xl border border-border-default bg-surface-card text-sm font-medium text-text-secondary transition-colors hover:bg-hover"
          >
            게스트로 둘러보기
          </button>

          <p className="pt-1 text-center text-xs text-text-tertiary">
            게스트 데이터는 이 기기에만 저장돼요
          </p>
        </footer>
      </div>
    </div>
  )
}

export default LoginPage
