# Frontend Implementation (React + Vite)

## 1. 스택/의존성

| 분류 | 라이브러리 |
|------|-----------|
| 빌드 | Vite + pnpm |
| UI | React 18 + TypeScript |
| 라우팅 | React Router |
| 서버 상태 | TanStack Query |
| 클라이언트 상태 | Zustand (타이머) |
| 스타일 | Tailwind CSS 4.x |
| 폼 | react-hook-form + zod |
| 유틸 | date-fns, clsx |
| 알림 | react-hot-toast |
| DnD | @dnd-kit/core, @dnd-kit/sortable |
| 모킹 | MSW (Mock Service Worker) |
| 테스트 | Vitest + @testing-library/react |

---

## 2. 폴더 구조

```
src/
├── api/                    # API 클라이언트
│   ├── http.ts            # fetch 래퍼
│   ├── todos.ts           # Todo API
│   ├── settings.ts        # Settings API
│   └── types.ts           # Zod 스키마 & 타입
├── app/                    # 앱 설정
│   ├── App.tsx            # 레이아웃 & 네비게이션
│   ├── AppProviders.tsx   # QueryClient, Toaster
│   ├── routes.tsx         # 라우트 정의
│   └── queryClient.ts
├── features/
│   ├── todos/             # Todo 기능
│   │   ├── TodosPage.tsx
│   │   ├── TodoItem.tsx
│   │   ├── SortableTodoItem.tsx
│   │   ├── hooks.ts       # useTodos, useCreateTodo 등
│   │   ├── useTodoActions.ts  # 핸들러 훅
│   │   └── components/
│   │       └── DailyStatsBadges.tsx
│   ├── timer/             # 타이머 기능
│   │   ├── TimerFullScreen.tsx
│   │   ├── timerStore.ts      # Zustand 스토어
│   │   ├── useTimerTicker.ts  # Ticker 훅
│   │   ├── useTimerActions.ts # 액션 핸들러
│   │   └── useTimerInfo.ts    # 타이머 정보 계산
│   └── settings/          # 설정
│       ├── PomodoroSettingsPage.tsx
│       └── hooks.ts
├── ui/                     # 공통 UI 컴포넌트
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Calendar.tsx
│   ├── BottomSheet.tsx
│   ├── Icons.tsx
│   └── ...
├── lib/                    # 유틸리티
│   ├── constants.ts
│   ├── time.ts
│   ├── timerFormat.ts     # 시간 포맷 함수들
│   ├── sound.ts
│   └── queryKeys.ts
├── mocks/                  # MSW 핸들러
│   ├── handlers.ts
│   └── browser.ts
└── styles/
    └── globals.css
```

---

## 3. 라우팅

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/todos` | TodosPage | 캘린더 + Todo 목록 |
| `/settings/pomodoro` | PomodoroSettingsPage | 타이머 설정 |

- 타이머는 풀스크린 오버레이 (`TimerFullScreen`)로 구현

---

## 4. 상태 관리

### 서버 상태 (TanStack Query)
- `useTodos` - Todo 목록 조회
- `useCreateTodo` - Todo 생성
- `useUpdateTodo` - Todo 수정
- `useDeleteTodo` - Todo 삭제
- `useCompleteTodo` - 뽀모도로 세션 완료 기록 (시간+횟수)
- `useAddFocus` - 일반 타이머 시간 기록 (시간만)
- `usePomodoroSettings` - 설정 조회
- `useUpdatePomodoroSettings` - 설정 수정

### 클라이언트 상태 (Zustand)
- `timerStore` - 타이머 상태 관리
  - 필드: 
    - `timers`: 각 Todo별 타이머 상태 (Map 구조)
      - `todoId`, `mode`, `phase`, `status`, `endAt`, `remainingMs`, `elapsedMs`, `cycleCount`, `settingsSnapshot`, `initialFocusMs`
    - `autoCompletedTodos`: 자연 완료된 Flow 추적용 Set
  - actions: 
    - 기본: `startPomodoro`, `startStopwatch`, `pause`, `resume`, `stop`, `reset`
    - Phase 전환: `completePhase`, `skipToPrev`, `skipToNext`
    - 헬퍼: `canSkipToPrev`, `canSkipToNext`, `updateInitialFocusMs`, `clearAutoCompleted`
  - sessionStorage에 상태 저장/복구 (페이지 새로고침 대응)
  - 정지 후 재개 가능 (pause 상태 유지)

---

## 5. 주요 기능

### 캘린더
- 월간/주간 뷰 전환
- 스와이프로 월/주 이동
- 날짜별 진행도 표시 (남은 개수 / 완료 체크)
- 오늘 버튼

### Todo
- 생성/수정/삭제/완료
- 드래그로 순서 변경 (@dnd-kit)
- 메모 기능
- 일별 통계 뱃지 (미완료/완료/세션)

### 타이머
- **뽀모도로** (카운트다운)
  - Flow → Short Break → Flow → ... → Long Break
  - 세션 기반 양방향 네비게이션 (←/→)
  - 리셋 버튼으로 첫 Flow로 복귀
  - Flow 완료 시에만 세션 카운트 증가
  - Break에서 완료 버튼 비활성화
- **일반 타이머** (스톱워치)
  - 00:00:00부터 카운트업
  - 시간만 기록 (세션 횟수 증가 X)
- **공통 기능**
  - 정지(■): 기록 + pause 상태 유지 + 닫기
  - 완료(✓): 기록 + 태스크 완료 + 닫기
  - 재오픈 시 이전 상태에서 이어서 진행 가능
  - Flow → 휴식 자동 전환 (설정 가능)
  - 타이머 완료 시 알림음
  - Phase별 배경색 (Flow: 검정, Break: 에메랄드)

---

## 6. 데이터 영속성

### 개발 환경 (MSW)
- localStorage에 데이터 저장
- 새로고침해도 유지
- 키: `todo-flow/todos`, `todo-flow/settings`

### 프로덕션
- 백엔드 API 연동 예정

---

## 7. 실행 방법

```bash
# 의존성 설치
cd frontend && pnpm install

# 개발 서버 (MSW 모킹)
pnpm dev:mock

# 개발 서버 (실제 API)
pnpm dev

# 프로덕션 빌드
pnpm build

# 빌드 미리보기
pnpm preview

# 테스트
pnpm test
```

---

## 8. 환경 변수

```env
VITE_API_BASE_URL=/api
VITE_USE_MOCK=1
```

---

## 9. 테스트

| 파일 | 내용 |
|------|------|
| `timerStore.test.ts` | 타이머 phase 전환, pause/resume/restore |
| `api.test.ts` | Todo CRUD, Settings API (MSW) |

```bash
pnpm test      # 전체 테스트
pnpm test:ui   # UI 모드
```
