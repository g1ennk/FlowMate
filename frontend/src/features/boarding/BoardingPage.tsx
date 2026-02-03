import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../ui/Button'
import {
  CalendarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
} from '../../ui/Icons'
import { setOnboardingSeen } from '../../lib/onboarding'

type Slide = {
  title: string
  description: string
  chips: [string, string]
  main: typeof CheckCircleIcon
  secondary: typeof CheckCircleIcon
  caption: string
}

const slides: Slide[] = [
  {
    title: '할 일과 집중을 한 곳에',
    description: 'Todo에서 바로 타이머를 시작하고, 오늘의 흐름을 기록하세요.',
    chips: ['Todo', 'Flow'],
    main: CheckCircleIcon,
    secondary: ClockIcon,
    caption: '하나의 목록에서 집중까지',
  },
  {
    title: '끊김 없는 Flow 타이머',
    description: '카운트업 집중 + 필요할 때만 휴식, 몰입을 유지합니다.',
    chips: ['Focus', 'Break'],
    main: ClockIcon,
    secondary: CheckCircleIcon,
    caption: '유연한 몰입 루프',
  },
  {
    title: '기록으로 돌아보기',
    description: '캘린더와 통계로 하루 흐름을 한눈에 확인하세요.',
    chips: ['Calendar', 'Stats'],
    main: ChartBarIcon,
    secondary: CalendarIcon,
    caption: '나의 흐름이 쌓이는 곳',
  },
]

function BoardingIllustration({ slide }: { slide: Slide }) {
  const MainIcon = slide.main
  const SecondaryIcon = slide.secondary

  return (
    <div className="relative flex w-full items-center justify-center">
      <div className="pointer-events-none absolute -top-10 right-6 h-24 w-24 rounded-full bg-emerald-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-6 left-8 h-20 w-20 rounded-full bg-emerald-50/80 blur-3xl" />

      <div className="relative h-[280px] w-[180px] rounded-[2.5rem] border border-emerald-100 bg-white shadow-[0_24px_60px_-40px_rgba(16,185,129,0.6)]">
        <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-gray-200" />
        <div className="absolute inset-4 rounded-[1.8rem] bg-gradient-to-b from-emerald-50 via-white to-white p-4">
          <div className="flex items-center justify-between text-[10px] font-semibold text-gray-400">
            <span>Flow</span>
            <span>Mate</span>
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
              <MainIcon className="h-8 w-8" strokeWidth={1.8} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            {slide.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-600"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-100/70 bg-white/80 px-3 py-2 text-[11px] font-medium text-gray-600 shadow-sm">
            {slide.caption}
          </div>
        </div>

        <div className="absolute -right-3 top-16 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-100 bg-white text-emerald-500 shadow-md">
          <SecondaryIcon className="h-5 w-5" strokeWidth={1.8} />
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
    navigate('/todos', { replace: true })
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

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-0 h-64 w-64 rounded-full bg-emerald-50/80 blur-3xl" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10">
        <header className="flex items-center justify-between">
          <div className="text-lg font-semibold tracking-tight text-gray-900">
            Flow<span className="text-emerald-500">Mate</span>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-600">
            집중과 기록
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
          <div key={step} className="animate-fade-in space-y-6">
            <BoardingIllustration slide={slide} />

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-gray-900">
                {slide.title}
              </h1>
              <p className="text-sm text-gray-500">
                {slide.description}
              </p>
            </div>
          </div>
        </main>

        <footer className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handlePrev}
              disabled={step === 0}
              aria-label="이전"
              className={`flex items-center justify-center p-2 transition-colors ${
                step === 0
                  ? 'text-gray-300'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <ChevronLeftIcon className="h-5 w-5" strokeWidth={2} />
            </button>

            <div className="flex items-center gap-2">
              {slides.map((_, index) => (
                <span
                  key={String(index)}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    index === step ? 'bg-emerald-500' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleNext}
              aria-label={step === slides.length - 1 ? '시작하기' : '다음'}
              className="flex items-center justify-center p-2 text-gray-900 transition-colors hover:text-gray-700"
            >
              <ChevronRightIcon className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default BoardingPage
