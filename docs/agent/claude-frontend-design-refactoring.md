# FlowMate 프론트엔드 디자인 전면 리팩토링 계획

## 개요
Tailwind CSS v4 `@theme` 기반 디자인 토큰 도입, 일관성 수정, 접근성 개선, 대형 컴포넌트 분리, 스켈레톤 로딩, 반응형 대응까지 전면 리팩토링.

---

## Phase 0: clsx 통일 (사전 작업)

모든 컴포넌트에서 조건부 클래스 작성 방식을 `clsx`로 통일. 현재 `Card.tsx`만 `clsx` 사용, 나머지는 template literal 또는 `.join(' ')` 사용.

**수정 파일:** `ui/Button.tsx`, `ui/BottomSheet.tsx`, `ui/Switch.tsx`, `ui/Calendar.tsx`, `app/App.tsx`, `features/timer/TimerFullScreen.tsx`, `features/todos/TodosPage.tsx`, `features/todos/components/TodoItem.tsx`, `features/settings/PomodoroSettingsPage.tsx`, `features/review/components/PeriodTabs.tsx` 외 전체

---

## Phase 1: 디자인 토큰 기반 구축

### 1.1: `src/styles/globals.css`에 `@theme` 블록 추가

```css
@theme {
  /* 색상 */
  --color-primary: #10b981;
  --color-primary-hover: #059669;
  --color-primary-active: #047857;
  --color-primary-light: #ecfdf5;
  --color-primary-muted: #d1fae5;
  --color-primary-text: #047857;
  --color-primary-text-light: #059669;

  --color-danger: #ef4444;
  --color-danger-light: #fef2f2;
  --color-danger-text: #dc2626;

  --color-warning: #f59e0b;        /* amber 계열로 통일 */
  --color-warning-light: #fffbeb;
  --color-warning-text: #d97706;
  --color-warning-border: #fde68a;

  --color-surface: #ffffff;
  --color-backdrop: rgb(0 0 0 / 0.4);
  --color-timer-bg: #000000;
  --color-timer-break-bg: #059669;

  /* 테두리 반경 */
  --radius-sm: 0.5rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;

  /* 그림자 */
  --shadow-card: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-sheet: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  --shadow-toast: 0 25px 50px -12px rgb(0 0 0 / 0.25);

  /* z-index 스케일 */
  --z-nav: 50;
  --z-sheet: 100;
  --z-timer-fullscreen: 200;
  --z-timer-modal: 210;
  --z-toast: 300;

  /* 마이크로 타이포그래피 */
  --text-micro: 0.625rem;   /* 10px - 탭 라벨, 캘린더 표시 */
  --text-mini: 0.6875rem;   /* 11px - 통계 라벨, 타임라인 */
}
```

### 1.2: `src/styles/tokens.ts` 생성 (JS에서 사용할 z-index 등)

```ts
export const zIndex = {
  nav: 50,
  sheet: 100,
  timerFullscreen: 200,
  timerModal: 210,
  toast: 300,
} as const
```

---

## Phase 2: 공유 UI 컴포넌트 토큰 마이그레이션

| 파일 | 주요 변경 |
|------|----------|
| `ui/Button.tsx` | `emerald-*` → `primary-*`, `.join(' ')` → `clsx` |
| `ui/Card.tsx` | `rounded-2xl` → `rounded-lg`, `gray-*` → `neutral-*` |
| `ui/BottomSheet.tsx` | `z-index: 9999` → 토큰, `text-blue-500` → `text-primary`, `bg-black/40` → `bg-backdrop` |
| `ui/Switch.tsx` | `emerald-500` → `primary`, `gray-200` → `neutral-200` |
| `ui/Calendar.tsx` | 색상 토큰화, `text-[9px]` → `text-micro`, prev/next에 `aria-label` 추가 |

---

## Phase 3: 피처 컴포넌트 토큰 마이그레이션

**수정 대상 (~20개 파일):**
- `app/App.tsx` — 색상 토큰화, `text-[10px]` → `text-micro`, nav에 `aria-label` 추가
- `features/todos/TodosPage.tsx` — 전체 색상 토큰화, `z-[10000]` → z-index 토큰
- `features/todos/components/TodoItem.tsx` — `yellow-*` → `warning-*` 통일, `aria-label` 추가
- `features/timer/TimerFullScreen.tsx` — `z-[9999]` → 토큰, `bg-opacity-50` → `bg-black/50`, 색상 토큰화
- `features/settings/PomodoroSettingsPage.tsx` — 색상 토큰화
- `features/review/ReviewPage.tsx` — 색상 토큰화
- `features/review/components/StatsSummary.tsx` — `p-2` → `p-3`, `text-[11px]` → `text-mini`
- `features/review/components/PeriodTabs.tsx` — `p-2` → `p-3`
- `features/review/components/*.tsx` (나머지 전부) — `text-[10px]`/`text-[11px]` → `text-micro`/`text-mini`
- `features/boarding/BoardingPage.tsx` — 색상 토큰화
- `app/NotFoundPage.tsx` — 인라인 SVG → Icons.tsx 컴포넌트 사용

---

## Phase 4: 타이포그래피 & 간격 통일

### 타이포그래피 규칙 확정
| 용도 | 클래스 |
|------|--------|
| 페이지 제목 (h1) | `text-2xl font-bold text-neutral-900` |
| 카드 제목 (h2) | `text-base font-semibold text-neutral-900` |
| 섹션 제목 (h3) | `text-sm font-semibold text-neutral-900` |
| 본문 | `text-sm text-neutral-700` |
| 캡션/라벨 | `text-xs text-neutral-500` |
| 마이크로 | `text-mini text-neutral-500` (11px) |
| 탭 라벨 | `text-micro font-medium` (10px) |

### 변경사항
- `BoardingPage.tsx:138` — `font-semibold` → `font-bold` (페이지 제목 통일)
- `text-[9px]` 전부 제거 → `text-micro` (10px)
- `text-[10px]` → `text-micro`, `text-[11px]` → `text-mini` 전부 통일
- `PomodoroSettingsPage.tsx` `space-y-6` 유지 (설정 페이지 의도적 여백)

---

## Phase 5: 접근성(A11y) 개선

### 5.1: aria-label 추가
| 위치 | 추가할 aria-label |
|------|-------------------|
| `Calendar.tsx` prev/next 버튼 | `"이전"` / `"다음"` |
| `TodoItem.tsx` 체크박스 버튼 | `isDone ? '완료 해제' : '완료로 표시'` |
| `TodoItem.tsx` 더보기 버튼 | `"더보기"` |
| `App.tsx` NavLink들 | 각 `tab.label` |
| `PeriodNavigator.tsx` 버튼들 | `"이전 기간"` / `"다음 기간"` |
| `TimerFullScreen.tsx` 뒤로 버튼 | `"닫기"` |

### 5.2: 명암비 개선
- 의미 있는 정보를 전달하는 `text-gray-400` (명암비 2.68:1) → `text-neutral-500` (4.75:1, AA 충족)

### 5.3: 시맨틱 HTML
- `TodosPage` / `ReviewPage`에 `<h1 className="sr-only">` 추가
- `TodoItem.tsx` 노트 `<div onClick>` → `<button>` 교체

### 5.4: BottomSheet 포커스 트랩
- `useFocusTrap` 커스텀 훅 생성 (~30줄)
- 열릴 때 첫 포커스 가능 요소로 이동, Tab/Shift+Tab 트랩, 닫힐 때 원래 요소로 복귀

---

## Phase 6: z-index 정리 & 기타 클린업

| 파일 | 현재 | 변경 |
|------|------|------|
| `BottomSheet.tsx` | `zIndex: 9999` | `zIndex: zIndex.sheet` (100) |
| `TimerFullScreen.tsx` | `z-[9999]` | `z-[var(--z-timer-fullscreen)]` (200) |
| `TimerFullScreen.tsx` 모달들 | `z-10` | `z-[var(--z-timer-modal)]` (210) |
| `TodosPage.tsx` 에러 토스트 | `z-[10000]` | `z-[var(--z-toast)]` (300) |

- `bg-black bg-opacity-50` (레거시) → `bg-black/50` (v4 문법)
- `BottomSheetActionButton` `text-blue-500` → `text-primary`

---

## Phase 7: 대형 컴포넌트 분리

### 7.1: `TimerFullScreen.tsx` (944줄 → ~200줄 오케스트레이터)
새 파일 (`features/timer/components/`):
- `CompleteConfirmationModal.tsx` — 완료 확인 모달
- `ResetConfirmationModal.tsx` — 리셋 확인 모달
- `BreakSelectionSheet.tsx` — 휴식 선택 시트
- `TimerControlButtons.tsx` — 반복되는 아이콘+라벨 버튼 패턴
- `SessionDots.tsx` — 세션 표시 점들
- `StopwatchDisplay.tsx` — 집중 모드 표시
- `StopwatchBreakDisplay.tsx` — 휴식 모드 표시
- `PomodoroDisplay.tsx` — 뽀모도로 모드 표시

### 7.2: `TodosPage.tsx` (1298줄 → ~400줄 오케스트레이터)
새 파일 (`features/todos/components/`):
- `TodoSection.tsx` — 섹션별 렌더링 (헤더, 접기, 정렬 가능 목록)
- `TodoInputField.tsx` — 할 일 입력 textarea
- `TodoActionsSheet.tsx` — 할 일 액션 바텀시트
- `NoteEditingSheet.tsx` — 노트 편집 바텀시트
- `FloatingErrorMessage.tsx` — 타이머 에러 메시지

### 7.3: `PomodoroSettingsPage.tsx` (680줄 → ~250줄)
새 파일 (`features/settings/components/`):
- `WheelColumn.tsx` — 휠 선택기
- `MiniDayEditor.tsx` — 미니데이 편집기
- `SettingsRow.tsx` — 설정 행

---

## Phase 8: 로딩 & 트랜지션 UX

### 8.1: `ui/Skeleton.tsx` 생성
- `Skeleton` — 기본 스켈레톤 블록 (`animate-pulse rounded-lg bg-neutral-200`)
- `CardSkeleton` — 카드형 스켈레톤
- `StatsSkeleton` — 통계 영역 스켈레톤

### 8.2: 로딩 상태 교체
- `App.tsx` Suspense fallback → `CardSkeleton` 반복
- `TodosPage.tsx` 로딩 → 투두 전용 스켈레톤
- `ReviewPage.tsx` 로딩 → `StatsSkeleton` + `CardSkeleton`

### 8.3: 페이지 전환 애니메이션
`globals.css`에 `page-enter` 키프레임 추가 (0.15s fade-in), 각 페이지 루트에 적용

---

## Phase 9: 반응형 디자인 (모바일 퍼스트 + 태블릿 대응)

### 9.1: 콘텐츠 너비 확장
`App.tsx`: `max-w-lg` → `max-w-lg md:max-w-2xl lg:max-w-4xl`

### 9.2: 네비게이션 반응형
- `lg+`: 하단 탭바 숨기고 좌측 사이드바 표시 (`hidden lg:flex lg:w-60 lg:flex-col`)
- `< lg`: 기존 하단 탭바 유지 (`lg:hidden`)

### 9.3: 리뷰 페이지 멀티컬럼
- `md+`: `StatsSummary` + `ReviewTextarea` 나란히 배치 (`md:grid md:grid-cols-2`)

### 9.4: 타이머/캘린더
- 타이머 풀스크린: 변경 없음 (고정 `inset-0`)
- 캘린더: 7열 그리드가 자연스럽게 확장되므로 변경 불필요

---

## 검증 방법

1. **빌드 확인**: 각 Phase 완료 후 `pnpm build` 성공 확인
2. **테스트**: `pnpm test` 기존 테스트 통과 확인
3. **시각적 회귀 테스트**: 375px(모바일), 768px(태블릿), 1024px+(데스크탑)에서 확인
4. **토큰 동작 확인**: DevTools에서 `--color-primary` 변경 시 앱 전체 색상 일괄 변경되는지 확인
5. **접근성**: axe-core 브라우저 확장으로 각 페이지 검사, 키보드 탭 네비게이션 확인
6. **z-index**: 모든 오버레이(BottomSheet, Timer, 모달) 동시 열어서 스태킹 순서 확인

---

## 실행 순서 & 의존관계

```
Phase 0 (clsx 통일)
  ↓
Phase 1 (디자인 토큰 정의) ← 기반
  ↓
Phase 2 (공유 UI 마이그레이션)
  ↓
Phase 3 (피처 컴포넌트 마이그레이션) + Phase 6 (z-index/클린업) 병렬 가능
  ↓
Phase 4 (타이포 & 간격) + Phase 5 (접근성) 병렬 가능
  ↓
Phase 7 (컴포넌트 분리) ← Phase 3 이후
  ↓
Phase 8 (로딩/트랜지션) + Phase 9 (반응형) 병렬 가능
```

---

## 브랜치 & 워크트리 운영 전략 (기준: `develop`)

대규모 리팩토링 충돌을 줄이기 위해 **stacked PR + git worktree** 방식으로 진행.

### 1) 기준 브랜치 동기화

```bash
cd /Users/glenn/projects/FlowMate
git fetch origin
git switch develop
git pull --ff-only origin develop
```

### 2) PR별 브랜치/워크트리 생성

브랜치 네이밍은 `codex/` prefix 사용.

```bash
git worktree add /Users/glenn/worktrees/flowmate-pr1 -b codex/frontend-refactor-pr1 origin/develop
git worktree add /Users/glenn/worktrees/flowmate-pr2 -b codex/frontend-refactor-pr2 codex/frontend-refactor-pr1
git worktree add /Users/glenn/worktrees/flowmate-pr3 -b codex/frontend-refactor-pr3 codex/frontend-refactor-pr2
git worktree add /Users/glenn/worktrees/flowmate-pr4 -b codex/frontend-refactor-pr4 codex/frontend-refactor-pr3
git worktree add /Users/glenn/worktrees/flowmate-pr5 -b codex/frontend-refactor-pr5 codex/frontend-refactor-pr4
```

### 3) PR 범위 매핑

- `codex/frontend-refactor-pr1`: Phase 0~2 (`clsx` 통일 + 토큰 + 공용 UI)
- `codex/frontend-refactor-pr2`: Phase 3 + 6 (피처 토큰 마이그레이션 + z-index/클린업)
- `codex/frontend-refactor-pr3`: Phase 5 (접근성 개선)
- `codex/frontend-refactor-pr4`: Phase 7 (대형 컴포넌트 분리, 동작/스타일 동일 유지)
- `codex/frontend-refactor-pr5`: Phase 8 + 9 (로딩/트랜지션 + 반응형)

### 4) PR 베이스 브랜치 규칙 (stacked)

- PR1 base: `develop`
- PR2 base: `codex/frontend-refactor-pr1`
- PR3 base: `codex/frontend-refactor-pr2`
- PR4 base: `codex/frontend-refactor-pr3`
- PR5 base: `codex/frontend-refactor-pr4`

### 5) 각 PR 머지 전 필수 검증

```bash
cd frontend
pnpm lint
pnpm test
pnpm build
```

추가로 375px / 768px / 1024px+ 뷰포트에서 핵심 플로우 수동 확인.

### 6) 머지 후 워크트리 정리

```bash
git worktree remove /Users/glenn/worktrees/flowmate-pr1
git worktree remove /Users/glenn/worktrees/flowmate-pr2
git worktree remove /Users/glenn/worktrees/flowmate-pr3
git worktree remove /Users/glenn/worktrees/flowmate-pr4
git worktree remove /Users/glenn/worktrees/flowmate-pr5
```
