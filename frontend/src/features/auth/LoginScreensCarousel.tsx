import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import planDark from '../../assets/login/plan-dark.webp'
import planLight from '../../assets/login/plan-light.webp'
import reviewDark from '../../assets/login/review-dark.webp'
import reviewLight from '../../assets/login/review-light.webp'
import timerShot from '../../assets/login/timer.webp'
import { loginPreviewMessages as m } from '../../lib/messages'
import { useThemeStore } from '../../store/themeStore'
import { IconButton } from '../../ui/IconButton'
import { ChevronLeftIcon, ChevronRightIcon } from '../../ui/Icons'
import type { LoginPreviewFit } from './loginPreviewLayout'

// 로그인 화면의 실제 앱 화면 넘겨 보기(계획 → 타이머 → 회고). 캡처는 scripts/capture-login-shots.mjs로 다시 만든다.
// 장면 한 장은 연한 회색 면 위에 위치 점, 두 줄 제목, 작은 휴대폰 화면을 쌓고, 휴대폰은 회색 면 아래 경계에서 평평하게 잘린다.
// 휴대폰에서는 밀어서, 마우스가 있는 넓은 화면에서는 양옆 화살표로, 어디서나 점과 ←/→ 키로 넘긴다.
// 자동으로 넘기지 않고, 처음과 끝에서 돌아 감지 않는다. 지금 장면 하나만 그린다(옆 장면 캡처는 미리 받아 둔다)

const SCENES = [
  { key: 'plan', light: planLight, dark: planDark, ...m.plan },
  // 타이머 화면은 테마와 상관없이 늘 어두워 캡처 한 장을 두 테마에 같이 쓴다
  { key: 'timer', light: timerShot, dark: timerShot, ...m.timer },
  { key: 'review', light: reviewLight, dark: reviewDark, ...m.review },
] as const

// 이만큼 가로로 움직이고, 세로보다 가로로 더 움직였을 때만 넘긴다(세로 스크롤과 살짝 닿은 손가락은 무시)
const SWIPE_MIN_DISTANCE = 40

// 화살표는 마우스로 가리킬 수 있고 회색 면 바깥 양옆에 놓을 자리가 있는 화면(600 이상)에서만 보인다. 터치 화면은 밀기와 점으로 넘긴다
const ARROW_SLOT = 'absolute top-1/2 hidden -translate-y-1/2 [@media(hover:hover)_and_(pointer:fine)_and_(min-width:600px)]:block'

type Props = { fit: LoginPreviewFit }

export function LoginScreensCarousel({ fit }: Props) {
  const theme = useThemeStore((s) => s.resolved)
  const [index, setIndex] = useState(0)
  // 캡처를 받지 못하면(오프라인에서 처음 연 경우 등) 빈 휴대폰 틀을 보이지 않게 미리보기를 통째로 뺀다
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const last = SCENES.length - 1
  const scene = SCENES[index]

  // 옆 장면 캡처를 미리 받아 두어 넘길 때 화면이 잠깐 비지 않게 한다
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const s = SCENES[i]
      if (s) new Image().src = theme === 'dark' ? s.dark : s.light
    }
  }, [index, theme])

  const go = (to: number) => {
    const target = Math.max(0, Math.min(last, to))
    if (target === index) return
    setIndex(target)
    // 방금 누른 버튼이 끝에 닿아 비활성이 되면 포커스가 사라지지 않게 반대쪽 버튼으로 옮긴다
    const button = (label: string) => rootRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    const active = document.activeElement
    if (target === last && active === button(m.next)) button(m.prev)?.focus()
    if (target === 0 && active === button(m.prev)) button(m.next)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      go(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      go(index + 1)
    }
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const t = event.touches[0]
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStart.current
    const t = event.changedTouches[0]
    touchStart.current = null
    if (!start || !t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return
    go(dx < 0 ? index + 1 : index - 1)
  }

  if (failed) return null

  return (
    <section
      ref={rootRef}
      role="region"
      aria-roledescription={m.roledescription}
      aria-label={m.region}
      onKeyDown={handleKeyDown}
      className="relative mx-auto"
      style={{ width: fit.panelWidth }}
    >
      {/* 장면 한 장: 회색 면 안에 점, 제목, 휴대폰. 휴대폰은 아래 경계에서 잘려 위쪽만 보인다 */}
      <div
        data-preview-panel
        className="flex touch-pan-y flex-col items-center overflow-hidden rounded-card bg-surface-sunken pt-5"
        style={{ height: fit.panelHeight }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 위치 점: 지금 장면은 막대, 나머지는 점(타이머 사이클 점과 같은 모양). 점을 눌러 그 장면으로 간다.
            보이는 점은 6이고 버튼은 높이 24, 양옆 4씩 넓혀 누르기 쉽게 한다 */}
        <div data-carousel-dots className="flex h-6 items-center">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={m.dot(i + 1)}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => go(i)}
              className="flex h-6 items-center rounded-full px-1"
            >
              <span
                className={`block h-1.5 rounded-full transition-[width] motion-reduce:transition-none ${i === index ? 'w-4 bg-accent' : 'w-1.5 bg-border-strong'}`}
              />
            </button>
          ))}
        </div>

        <p className="mt-2 h-14 whitespace-pre-line break-keep text-center text-lg font-bold leading-7 text-text-primary">
          {scene.title}
        </p>

        {/* 휴대폰 화면 하나. 둥근 위 모서리와 1px 테두리만 두고 기기 틀, 노치, 그림자는 그리지 않는다.
            아래는 회색 면 경계에서 잘리므로 아래 테두리가 없다.
            장면이 바뀌면 key가 바뀌어 0.2초 페이드로 들어온다. 움직임 줄이기에서는 바로 바뀐다 */}
        <div
          data-preview-phone
          className="mt-4 shrink-0 overflow-hidden rounded-t-sheet border border-b-0 border-border-default"
          style={{ width: fit.phoneWidth, height: fit.phoneVisibleHeight }}
        >
          <img
            key={scene.key}
            src={theme === 'dark' ? scene.dark : scene.light}
            alt={scene.alt}
            width={fit.phoneWidth}
            height={fit.phoneFullHeight}
            draggable={false}
            decoding="async"
            onError={() => setFailed(true)}
            className="block h-auto w-full select-none animate-[overlay-in_0.2s_ease-out] motion-reduce:animate-none"
          />
        </div>
      </div>

      <span data-preview-arrow className={`${ARROW_SLOT} right-full mr-4`}>
        <IconButton label={m.prev} disabled={index === 0} onClick={() => go(index - 1)}>
          <ChevronLeftIcon />
        </IconButton>
      </span>
      <span data-preview-arrow className={`${ARROW_SLOT} left-full ml-4`}>
        <IconButton label={m.next} disabled={index === last} onClick={() => go(index + 1)}>
          <ChevronRightIcon />
        </IconButton>
      </span>

      <p aria-live="polite" className="sr-only">
        {m.position(index + 1, SCENES.length, scene.name)}
      </p>
    </section>
  )
}
