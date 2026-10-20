// 로그인 화면 "실제 화면 넘겨 보기"에 쓰는 앱 캡처 3장(계획, 타이머, 회고)을 다시 만든다.
// 결과: src/assets/login/{plan,review}-{light,dark}.webp, timer.webp (375×812 휴대폰 화면 전체, 장당 60KB 이하)
// 타이머 화면은 테마와 상관없이 늘 어두워 다크로 한 장만 찍는다.
//
// 실행 (frontend/에서):
//   1. 개발 서버(pnpm dev, http://localhost:5173)와 백엔드(http://localhost:8080)를 띄운다
//   2. PLAYWRIGHT_MODULE=<playwright 패키지 경로>/index.mjs node scripts/capture-login-shots.mjs [--raw <폴더>]
//      playwright는 package.json 의존성에 넣지 않는다. 설치된 곳을 PLAYWRIGHT_MODULE로 알려 주거나,
//      전역 또는 상위 폴더에서 import('playwright')가 풀리면 생략해도 된다.
//      --raw를 주면 줄이기 전 2배 PNG도 그 폴더에 남긴다.
//   환경 변수 CAPTURE_BASE로 다른 주소를 쓸 수 있다.
//
// 매번 새 게스트를 만들고 그럴듯한 하루(꾸준히 자기계발을 하는 직장인·학생)를 넣는다. 이미 있는 게스트의 기록은 건드리지 않는다.
// 타이머 장면은 진행 중인 타이머가 계획·회고 장면에 섞이지 않게 같은 할 일을 넣은 게스트를 따로 만든다.
// 시계는 page.clock으로 장면마다 정한 시각(KST)에 맞추고, 타이머는 시작한 뒤 시계를 앞으로 돌려 남은 시간을 만든다.
// webp 변환은 같은 브라우저의 canvas로 한다(추가 도구 없음).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.resolve(HERE, '..', 'src', 'assets', 'login')
const BASE = process.env.CAPTURE_BASE || 'http://localhost:5173'
const API = BASE + '/api'
const rawIdx = process.argv.indexOf('--raw')
const RAW_DIR = rawIdx > -1 ? path.resolve(process.argv[rawIdx + 1]) : null

// 375×812 휴대폰 화면 전체(위 머리부터 하단 탭까지)를 2배로 찍는다. 로그인 화면은 이 비율(LOGIN_SHOT_ASPECT,
// loginPreviewLayout.ts)로 틀을 잡으므로 바꾸면 함께 바꾼다. 로그인 화면에서는 폭 120~200의 작은 휴대폰으로 위쪽만 보여서
// 글자가 덜 뭉개지게 2배 크기(OUT_WIDTH 750) 그대로 저장한다(60KB를 넘으면 품질을 낮추고, 그래도 넘으면 OUT_WIDTH=375로 다시 찍는다)
const WIDTH = 375
const HEIGHT = 812
const OUT_WIDTH = Number(process.env.OUT_WIDTH ?? 750)
const SCALE = 2
const MAX_BYTES = 60 * 1024

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
}
const TODAY = kstDate(0)
const at = (hhmm) => new Date(`${TODAY}T${hhmm}:00+09:00`)

async function call(token, method, p, body) {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (res.status >= 300) throw new Error(`${method} ${p} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const POMO = 25 * 60
const REVIEW_TEXT = [
  '아침에 3km를 다 뛰고 출근해서 보고서 초안까지 오전에 끝냈다. 토익 LC도 한 회분을 다 풀었다.',
  '발표 자료는 생각보다 오래 걸려서 반만 손봤다. 내일은 오전에 25분 두 번으로 먼저 끝내 둔다.',
].join('\n')

// miniDay: 0 미분류, 1 오전, 2 오후, 3 저녁 (기본 미니데이 설정)
async function seedGuest({ withReview = true } = {}) {
  const { guestToken: token } = await call(null, 'POST', '/auth/guest/token')
  await call(token, 'PUT', '/settings/mini-days', {
    day1: { label: '오전', start: '06:00', end: '12:00' },
    day2: { label: '오후', start: '12:00', end: '18:00' },
    day3: { label: '저녁', start: '18:00', end: '24:00' },
  })
  await call(token, 'PUT', '/settings/pomodoro-session', { flowMin: 25, breakMin: 5, longBreakMin: 15, cycleEvery: 4 })
  await call(token, 'PUT', '/settings/automation', { autoStartBreak: false, autoStartSession: false })

  const todo = async (miniDay, dayOrder, title, { focus = [], mode = null, done = false, note = null } = {}) => {
    const { id } = await call(token, 'POST', '/todos', { title, date: TODAY, miniDay, dayOrder, note })
    for (const seconds of focus) {
      await call(token, 'POST', `/todos/${id}/sessions`, {
        sessionFocusSeconds: seconds,
        breakSeconds: mode === 'pomodoro' ? 300 : 0,
        clientSessionId: crypto.randomUUID(),
      })
    }
    if (mode) await call(token, 'PATCH', `/todos/${id}`, { timerMode: mode })
    if (done) await call(token, 'PATCH', `/todos/${id}`, { isDone: true })
  }
  await todo(0, 0, '장보기(우유, 계란, 두부)', { note: '두부조림 레시피 https://www.10000recipe.com/recipe/6907386' })
  await todo(0, 1, '병원 예약 전화', { done: true })
  await todo(1, 0, '아침 러닝 3km', { done: true })
  await todo(1, 1, '주간 보고서 초안', { focus: [POMO, POMO], mode: 'pomodoro', done: true })
  await todo(2, 0, '발표 자료 다듬기', { focus: [POMO], mode: 'pomodoro' })
  await todo(2, 1, '토익 LC 1회분', { focus: [POMO, POMO], mode: 'pomodoro' })
  await todo(3, 0, '독서 30쪽', { focus: [32 * 60], mode: 'stopwatch' })
  await todo(3, 1, '필라테스')
  if (withReview) {
    await call(token, 'PUT', '/reviews', { type: 'daily', periodStart: TODAY, periodEnd: TODAY, content: REVIEW_TEXT })
  }
  return token
}

const HIDE_DEVTOOLS_CSS = '[class*="tsqd"], #TanStackQueryDevtools, .tsqd-parent-container, .tsqd-open-btn-container { display: none !important; }'

async function newPage(browser, token, theme, time) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'reduce',
  })
  await context.addInitScript(({ token, theme, css }) => {
    localStorage.setItem('flowmate/auth/guest-token', token)
    localStorage.setItem('flowmate/onboarding/seen', 'true')
    localStorage.setItem('flowmate/auth/guest-started', '1')
    localStorage.setItem('flowmate/ui/guest-notice-seen', '1')
    localStorage.setItem('flowmate/ui/coach-marks-seen', JSON.stringify(['todos-intro', 'review-intro', 'settings-intro']))
    localStorage.setItem('flowmate/ui/theme', theme)
    const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s) }
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add)
  }, { token, theme, css: HIDE_DEVTOOLS_CSS })
  const page = await context.newPage()
  await page.clock.install({ time })
  return { context, page }
}

async function open(page, route) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  await page.locator('nav a').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1500)
}

const TIMER_ROOT = '[data-timer-fullscreen]'

// 장면마다 화면 하나를 그대로 찍는다. 계획은 오후가 지금 구간인 14:40, 타이머는 집중 중, 회고는 그날 밤 화면
const SCENES = {
  plan: {
    time: at('14:40'),
    go: async (page) => {
      await open(page, '/todos')
      await page.getByText('발표 자료 다듬기').first().waitFor()
    },
  },
  timer: {
    time: at('14:40'),
    ownGuest: true,
    themes: ['dark'],
    go: async (page) => {
      await open(page, '/todos')
      const openTimer = page.locator('button[aria-label="발표 자료 다듬기 타이머 화면 열기"]').first()
      if (await openTimer.count()) {
        await openTimer.click()
      } else {
        await page.locator('button[aria-label="발표 자료 다듬기 메뉴 열기"]').first().click()
        await page.locator('[role="dialog"]').last().getByRole('button', { name: /^뽀모도로 타이머/ }).click()
      }
      await page.locator(TIMER_ROOT).waitFor({ timeout: 8000 })
      await page.waitForTimeout(800)
      const start = page.locator(TIMER_ROOT).getByRole('button', { name: /^시작$/ })
      if (await start.count()) await start.first().click()
      // 집중을 시작하고 9분 20초가 지나 남은 시간이 15분 40초 안팎인 집중 중 화면(타이머 숫자는 초를 내림해 15:39로 보인다)
      await page.clock.fastForward(9 * 60_000 + 20_000)
      await page.waitForTimeout(1200)
    },
  },
  review: {
    time: at('22:10'),
    go: async (page) => {
      await open(page, `/review?period=daily&date=${TODAY}`)
      await page.getByText('발표 자료는').first().waitFor()
    },
  },
}

// PNG(2배) → OUT_WIDTH 폭으로 줄이기 → webp. 60KB를 넘으면 품질을 낮춰 다시 만든다
async function toWebp(encoder, png) {
  const outHeight = Math.round((OUT_WIDTH * HEIGHT) / WIDTH)
  for (const quality of [0.86, 0.8, 0.74, 0.68, 0.6]) {
    const dataUrl = await encoder.evaluate(async ({ src, w, h, quality }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      return canvas.toDataURL('image/webp', quality)
    }, { src: 'data:image/png;base64,' + png.toString('base64'), w: OUT_WIDTH, h: outHeight, quality })
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64')
    if (buf.length <= MAX_BYTES) return { buf, quality }
  }
  throw new Error('60KB 안으로 줄이지 못했어요')
}

const browser = await chromium.launch()
try {
  const token = await seedGuest()
  const encoderContext = await browser.newContext()
  const encoder = await encoderContext.newPage()
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (RAW_DIR) fs.mkdirSync(RAW_DIR, { recursive: true })
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null
  for (const [name, { time, ownGuest, themes = ['light', 'dark'], go }] of Object.entries(SCENES)) {
    if (only && !only.includes(name)) continue
    for (const theme of themes) {
      const sceneToken = ownGuest ? await seedGuest({ withReview: false }) : token
      const { context, page } = await newPage(browser, sceneToken, theme, time)
      await go(page)
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' })
      if (RAW_DIR) fs.writeFileSync(path.join(RAW_DIR, `${name}-${theme}.png`), png)
      const { buf, quality } = await toWebp(encoder, png)
      const file = path.join(OUT_DIR, themes.length > 1 ? `${name}-${theme}.webp` : `${name}.webp`)
      fs.writeFileSync(file, buf)
      console.log(`${path.relative(process.cwd(), file)}  ${(buf.length / 1024).toFixed(1)}KB  q${quality}`)
      await context.close()
    }
  }
} finally {
  await browser.close()
}
