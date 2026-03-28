import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentIcon,
} from '../../ui/Icons'
import { setOnboardingSeen } from '../../lib/onboarding'

type Slide = {
  eyebrow: string
  title: string
  description: string
  bullets: [string, string]
  chips: [string, string]
  main: typeof CheckCircleIcon
  secondary: typeof CheckCircleIcon
  caption: string
  tone: 'todo' | 'timer' | 'review'
}

const slides: Slide[] = [
  {
    eyebrow: '1. 계획',
    title: '오늘을 먼저 계획해요',
    description: '할 일을 적고 오전·오후·저녁으로 나누면 하루가 더 선명해져요.',
    bullets: ['떠오르는 일은 미분류에 먼저 적어요', '내 리듬에 맞게 미니데이로 나눠요'],
    chips: ['Todo', 'Mini Day'],
    main: CheckCircleIcon,
    secondary: ClockIcon,
    caption: '가볍게 시작해도 충분해요',
    tone: 'todo',
  },
  {
    eyebrow: '2. 실행',
    title: '할 일에서 바로 집중해요',
    description: '할 일을 열면 바로 시작할 수 있어요. 포모도로도, 일반 타이머도 내 방식대로요.',
    bullets: ['포모도로 · 일반 타이머 모두 지원', '집중과 휴식이 자동으로 기록돼요'],
    chips: ['Focus', 'Break'],
    main: ClockIcon,
    secondary: DocumentIcon,
    caption: '할 일에서 바로 시작해요',
    tone: 'timer',
  },
  {
    eyebrow: '3. 회고',
    title: '기록으로 오늘을 돌아봐요',
    description: '세션 기록과 통계로 흐름을 확인하고, 다음 계획을 더 쉽게 조정해요.',
    bullets: ['하루·주·월 흐름을 한눈에 확인', '잘 된 패턴으로 다음 루틴 조정'],
    chips: ['Session', 'Review'],
    main: DocumentIcon,
    secondary: CheckCircleIcon,
    caption: '기록이 다음 하루를 바꿔요',
    tone: 'review',
  },
]

function BoardingIllustration({ slide }: { slide: Slide }) {
  const MainIcon = slide.main
  const accentClass =
    slide.tone === 'todo'
      ? 'bg-accent shadow-emerald-200'
      : slide.tone === 'timer'
        ? 'bg-accent-hover shadow-emerald-200'
        : 'bg-accent shadow-emerald-100'
  const badgeTone =
    slide.tone === 'review'
      ? 'bg-accent-muted text-accent-text'
      : 'bg-accent-subtle text-accent'

  return (
    <div className="relative flex w-full items-center justify-center">
      <div className="pointer-events-none absolute -top-10 right-6 h-24 w-24 rounded-full bg-accent-muted/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-6 left-8 h-20 w-20 rounded-full bg-accent-subtle/80 blur-3xl" />

      <div className="relative h-[286px] w-[194px] rounded-3xl border border-accent bg-surface-card shadow-[0_24px_60px_-40px_rgba(16,185,129,0.55)]">
        <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-border-default" />
        <div className="absolute inset-4 rounded-[1.8rem] bg-gradient-to-b from-accent-subtle via-surface-card to-surface-card p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-text-tertiary">
            <span>Flow</span>
            <span>Mate</span>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-text-inverse shadow-lg ${accentClass}`}>
              <MainIcon className="h-8 w-8" strokeWidth={1.8} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            {slide.chips.map((chip) => (
              <span
                key={chip}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeTone}`}
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-accent/70 bg-surface-card/85 px-3 py-2 text-center text-[11px] font-medium leading-4 text-text-secondary shadow-sm break-keep [text-wrap:balance]">
            <span className="inline-block max-w-[12.5ch]">{slide.caption}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function BoardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const slide = useMemo(() => slides[step], [step])

  const handleComplete = () => {
    setOnboardingSeen(true)
    navigate('/login', { replace: true })
  }

  const handleNext = () => {
    if (step >= slides.length - 1) {
      handleComplete()
      return
    }
    setStep((prev) => Math.min(prev + 1, slides.length - 1))
  }

  const handlePrev = () => {
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const handleSkip = () => {
    handleComplete()
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface-card">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent-muted/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-64 w-64 rounded-full bg-accent-subtle/80 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-6 py-10">
        <header className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold tracking-tight text-text-primary">
            <span className="text-accent">Flow</span>Mate
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-full bg-accent-subtle px-3 py-1 text-[11px] font-semibold text-accent sm:block">
              계획 · 실행 · 회고
            </div>
            <button
              type="button"
              onClick={handleSkip}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-strong hover:text-text-secondary"
            >
              건너뛰기
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div key={step} className="animate-fade-in space-y-6">
            <BoardingIllustration slide={slide} />

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                  <span>{slide.eyebrow}</span>
                  <span className="text-text-disabled">•</span>
                  <span className="text-text-tertiary">{step + 1}/{slides.length}</span>
                </div>
              </div>
              <h1 className="break-keep text-2xl font-bold tracking-tight text-text-primary sm:text-[1.75rem]">
                {slide.title}
              </h1>
              <p className="mx-auto max-w-md break-keep text-sm leading-6 text-text-secondary">
                {slide.description}
              </p>
              <ul className="mx-auto max-w-sm space-y-1.5 text-left">
                {slide.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="grid grid-cols-[8px_1fr] items-start gap-x-2 break-keep text-[13px] leading-5 text-text-secondary"
                  >
                    <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-accent" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </main>

        <footer className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handlePrev}
              disabled={step === 0}
              aria-label="이전"
              className={`flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                step === 0
                  ? 'text-text-disabled'
                  : 'text-text-secondary hover:bg-hover-strong hover:text-text-primary'
              }`}
            >
              <ChevronLeftIcon className="h-5 w-5" strokeWidth={2} />
              <span>이전</span>
            </button>

            <div className="flex items-center gap-2">
              {slides.map((_, index) => (
                <span
                  key={String(index)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    index === step ? 'bg-accent' : 'bg-border-default'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label={step === slides.length - 1 ? '시작하기' : '다음'}
              className="flex items-center gap-1 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
            >
              <span>{step === slides.length - 1 ? '시작하기' : '다음'}</span>
              <ChevronRightIcon className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default BoardingPage
