# Frontend Implementation (React + Vite)

## 1. 스택/의존성

| 분류            | 라이브러리                       |
| --------------- | -------------------------------- |
| 빌드            | Vite + pnpm                      |
| UI              | React 19 + TypeScript            |
| 라우팅          | React Router                     |
| 서버 상태       | TanStack Query                   |
| 클라이언트 상태 | Zustand (타이머)                 |
| 스타일          | Tailwind CSS 4.x                 |
| 폼              | react-hook-form + zod            |
| 유틸            | date-fns, clsx                   |
| 알림            | react-hot-toast                  |
| DnD             | @dnd-kit/core, @dnd-kit/sortable |
| 모킹            | MSW (Mock Service Worker)        |
| 테스트          | Vitest + @testing-library/react  |

---

> Node.js 22.12.0 권장 (Vite 7 요구사항, `.nvmrc` 참고)

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
│   │   ├── components/
│   │   │   ├── TodoItem.tsx
│   │   │   └── SortableTodoItem.tsx
│   │   ├── hooks.ts       # useTodos, useCreateTodo 등
│   │   ├── useTodoActions.ts  # 핸들러 훅
│   │   └── statsUtils.ts  # 통계 계산/포맷 유틸
│   ├── timer/             # 타이머 기능
│   │   ├── TimerFullScreen.tsx
│   │   ├── timerStore.ts      # Zustand 스토어 (로직/액션)
│   │   ├── timerHelpers.ts    # 타이머 유틸리티 함수
│   │   ├── timerTypes.ts      # 타이머 타입 정의
│   │   ├── timerDefaults.ts   # 초기 상태
│   │   ├── timerPersistence.ts # localStorage 저장/복원
│   │   ├── timerFormat.ts     # 타이머 표시 포맷터
│   │   ├── useTimerTicker.ts  # Ticker 훅
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
│   ├── constants.ts       # 공통 상수 (MIN_FLOW_MS, PHASE_LABELS 등)
│   ├── time.ts
│   ├── sound.ts
│   └── queryKeys.ts
├── mocks/                  # MSW 핸들러
│   ├── handlers.ts
│   └── browser.ts
└── styles/
    └── globals.css
```

---

### API 클라이언트 동작
- 모든 API 요청에 `X-Client-Id` 헤더를 포함 (게스트 사용자 식별용)
- 클라이언트 ID는 `localStorage`의 `flowmate/client-id`에 저장됨

## 3. 라우팅

| 경로                 | 페이지               | 설명               |
| -------------------- | -------------------- | ------------------ |
| `/todos`    | TodosPage            | 캘린더 + Todo 목록 |
| `/stats`    | StatsPage            | 통계 페이지        |
| `/settings` | PomodoroSettingsPage | 타이머 설정        |

- 타이머는 풀스크린 오버레이 (`TimerFullScreen`)로 구현
- `/settings/pomodoro`는 `/settings`로 리다이렉트

---

## 4. 상태 관리

### 서버 상태 (TanStack Query)
- `useTodos` - Todo 목록 조회
- `useCreateTodo` - Todo 생성
- `useUpdateTodo` - Todo 수정
- `useDeleteTodo` - Todo 삭제
- `useReorderTodos` - Todo 순서 저장 (드래그 후)
- `useCompleteTodo` - 뽀모도로 세션 완료 기록 (시간+횟수)
- `useAddFocus` - 일반 타이머 시간 기록 (시간만)
- `usePomodoroSessionSettings` - 세션 설정 조회
- `useAutomationSettings` - 자동화 설정 조회
- `usePomodoroSettings` - 세션+자동화 병합 조회 (타이머용)
- `useUpdatePomodoroSettings` - 세션/자동화 분리 업데이트
- `useMiniDaysSettings` - MiniDays 설정 조회
- `useSettings` - 통합 Settings 조회(옵션)

### 클라이언트 상태 (Zustand)
- `timerStore` - 타이머 상태 관리
  - **Export 타입**: `TimerMode`, `TimerPhase`, `TimerStatus`, `FlexiblePhase`, `SingleTimerState`
  - **필드**: 
    - `timers`: 각 Todo별 타이머 상태 (Record 구조)
      - **뽀모도로**: `mode`, `phase`, `status`, `endAt`, `remainingMs`, `cycleCount`, `settingsSnapshot`
      - **일반 타이머**: `flexiblePhase`, `focusElapsedMs`, `breakElapsedMs`, `focusStartedAt`, `breakStartedAt`, `breakTargetMs`, `breakCompleted`, `sessionHistory`
      - **공통**: `initialFocusMs`, `elapsedMs` (레거시 호환)
    - `autoCompletedTodos`: 자동 완료된 Flow 추적용 Set
  - **Actions**: 
    - 기본: `startPomodoro`, `startStopwatch`, `pause`, `resume`, `stop`, `reset`
    - Phase 전환: `completePhase`, `skipToNext`
    - Flexible: `startBreak`, `resumeFocus`, `calculateBreakSuggestion`
    - 헬퍼: `updateInitialFocusMs`, `clearAutoCompleted`, `syncWithNow`, `tick`, `restore`
  - **Helpers** (`timerHelpers.ts`):
    - `checkTimerConflict`: 타이머 충돌 체크
    - `getPlannedMs`: 계획된 시간 계산
    - `getTimerConflictMessage`: 에러 메시지 생성
  - localStorage에 상태 저장/복구 (페이지 새로고침 대응)
  - 정지 후 재개 가능 (pause 상태 유지)

---

## 5. 주요 기능

### 캘린더
- 월간/주간 뷰 전환
- 스와이프로 월/주 이동
- 날짜별 진행도 표시 (남은 개수 / 완료 체크)
- 오늘 버튼

### Todo

#### 기본 기능
- 생성/수정/삭제/완료
- 하루를 Day 0~3 미니 데이로 분리한 리스트
  - Day 0: 미분류(Inbox), Day 1~3: 시간대 라벨
- Day 1~3 라벨/시간 범위는 miniDays 설정에서 로드 (기본: 오전/오후/저녁, UI는 비공개)
- 드래그로 순서 변경 및 Day 간 이동 (@dnd-kit)
- 완료된 Todo는 해당 Day 섹션의 완료 그룹에 유지
- 메모 기능
  - 순서는 `dayOrder`로 관리되며, 드래그 시 `PUT /api/todos/reorder`로 저장
  - 각 Todo는 `miniDay`(0~3)로 섹션을 결정

#### 집중 시간 표시
- 날짜 헤더 옆에 **선택 날짜 기준 Flow 합계**를 표시  
  - 표기: `총 Flow · ?시간 ?분`
  - 계산: `sessionHistory` 합계 우선, 없으면 `focusSeconds` 사용
- Day 섹션 헤더 옆에 **해당 Day 기준 Flow 합계** 표시  
  - 표기: `Flow · ?시간 ?분`
- 완료 섹션 헤더 옆에 **완료된 태스크 기준 Flow 합계** 표시  
  - 표기: `완료됨 · ?시간 ?분`

#### 태스크 추가 방법
**입력 필드 열기:**
- 각 Day 섹션의 `+` 버튼 클릭
- 해당 섹션 맨 아래에 인라인 입력 필드 표시

**태스크 추가:**
1. **Enter 키로 추가**
   - 태스크 추가 후 입력 필드 초기화
   - 입력 필드 유지 (연속 입력 가능)
   - 자동 포커스 유지
   - 여러 태스크를 빠르게 추가할 때 유용

2. **다른 곳 클릭 (blur)으로 추가**
   - 태스크 추가 후 입력 필드 닫힘
   - 한 번만 추가할 때 유용

3. **빈 상태에서 다른 곳 클릭**
   - 태스크 추가 안 됨
   - 입력 필드만 닫힘

**중복 방지:**
- `isSubmittingRef` 플래그로 Enter와 blur 동시 발생 시 중복 POST 요청 방지

### 설정 (Pomodoro)
- **경로**: `/settings`
- Flow/휴식/주기를 **프리셋 바텀시트**로 선택
- 변경 시 즉시 저장 (저장 버튼 없음)
- 사용자 지정 입력 UI는 다음 버전에서 공개 예정
  - MiniDays(라벨/시간)는 Day 1~3만 커스텀, Day 0는 미분류 고정

### 통계 페이지
- **경로**: `/stats`
- **기능**:
  - 전체 통계: 총 태스크, 완료 태스크, Flow 세션, 집중 시간
  - 날짜별 통계: 날짜별 태스크, 완료, Flow, 집중 시간
  - 태스크별 상세 정보:
    - 타이머 모드, Flow 세션 수, 집중 시간, 휴식 시간, 전체 걸린 시간
    - 세션 상세: 각 Flow별 집중 시간과 휴식 시간
  - 진행 중인 타이머 정보
- **데이터 소스**:
  - `sessionHistory` 기반 집중 시간 계산 (일반 타이머)
  - `focusSeconds`, `pomodoroDone` (뽀모도로 또는 sessionHistory 없는 경우)
> Note: MVP에서는 하단 탭에서 통계 탭을 숨김. 필요 시 URL로 직접 접근.

#### 태스크 편집
- 태스크 제목 클릭 시 인라인 편집 모드
- Enter로 저장, Escape로 취소
- 다른 곳 클릭 시 자동 저장 (onBlur)
- 취소/저장 버튼 없이 간소화된 UI

#### 메모 기능
- 메모 영역 클릭 시 모달 열림
- 읽기/편집 모드 분리
- 편집 모드: 상단에 "삭제"/"완료" 버튼
- 메모 클릭 시 편집 모드로 자동 전환 + 즉시 입력 가능
- 포스트잇 스타일 (노란색 배경)

### 타이머

#### 타이머 모드
- **뽀모도로 타이머** (카운트다운, 구조화된 집중)
  - Flow → Short Break → Flow → ... → Long Break
  - 자동 phase 전환 (설정 가능: `autoStartBreak`, `autoStartSession`)
  - 수동 스킵: "휴식" 버튼으로 다음 phase로 이동
  - **Dot 표시** (시간 아래 위치):
    - 완료된 Flow: 밝은 초록색 (`bg-emerald-400`)
    - 진행 중 Flow: 긴 도트 (`w-10 h-3`) + 내부 프로그레스바 (초록색 그라데이션) + 그림자
    - 예정된 Flow: 짧은 도트 (`w-2.5 h-2.5`) + 어두운 회색 (`bg-gray-700/50`)
    - Break phase일 때: 완료된 Flow는 흰색 (`bg-white/90`)
  - 자동 완료 시에만 Flow 카운트 증가 (`pomodoroDone`)
  - 긴 휴식 완료 후 자동으로 사이클 초기화 (`cycleCount = 0`)
  
- **일반 타이머** (카운트업, 자유로운 집중)
  - `MM:SS` 형식으로 표시 (예: `05:30`)
  - **Flow 개념**: `MIN_FLOW_MS` 이상 집중 + 명시적 행동(휴식/완료)
    - 최소 집중 시간: `MIN_FLOW_MS` (현재 0분, 0ms — 상수로 조정 가능)
    - 완료된 Flow만 카운트 (`pomodoroDone`)
    - 완료 처리 로직에서 현재 세션만 처리 (중복 카운트 방지)
  - **휴식 기능**:
    - "휴식" 버튼 클릭 → 추천 휴식 / 자유 휴식 선택
    - 추천 휴식: 집중 시간(분) * 20%를 반올림한 분 단위 (0분 가능, 카운트다운)
    - 자유 휴식: 무제한 카운트업 (`MM:SS` 형식)
  - **세션 히스토리** (`sessionHistory`):
    - 각 세션의 `focusMs`와 `breakMs` 저장 (`SessionRecord[]`)
    - `startBreak`에서 MIN_FLOW_MS 이상인 세션을 히스토리에 추가
    - `resumeFocus`에서 마지막 세션의 `breakMs` 업데이트
    - 완료 처리 로직에서 현재 세션을 히스토리에 추가/갱신 (MIN_FLOW_MS 기준)
    - 집중 재개 후 `focusElapsedMs`는 0부터 새로 시작
    - 완료된 태스크의 `sessionHistory`는 `pause` 상태로 유지 (통계 페이지에서 표시)
    - 현재는 `localStorage`에 저장 (브라우저 새로고침/재실행 시에도 유지, 추후 서버 저장 예정)
  - **Dot 표시** (시간 아래 위치):
    - 완료된 Flow: 밝은 초록색 (`bg-emerald-400`)
    - 진행 중 Flow: 짧은 도트 (`w-2.5 h-2.5`) + 깜빡임 애니메이션 (`animate-pulse`)
    - Flow phase일 때: 완료된 Flow는 초록색
    - Break phase일 때: 완료된 Flow는 흰색 (`bg-white/90`)
    - 추천 휴식(카운트다운) 중: 긴 도트(`w-10 h-3`) + 내부 프로그레스바
  - "집중 시작" 버튼으로 다시 집중 모드
  - 자동화 설정 적용: `autoStartSession`만 사용 (추천 휴식 종료 후 자동 집중 시작)

#### 공통 기능
- **일시정지/재개**: pause 상태로 저장, 언제든 재개 가능
  - **완료(✓)**: 기록 + 태스크 완료
    - 일반 타이머: `MIN_FLOW_MS` 이상이면 Flow 카운트 증가 (`completeTodo`), 미만이면 시간만 기록 (`addFocus`)
  - 뽀모도로: 자동 완료 시에만 Flow 카운트 증가
- **브라우저 탭 타이틀**: 실행 중인 타이머 시간 표시 (`Flow: M:SS` / `휴식: M:SS`)
- **timerMode 저장**: 사용자가 모드를 명시적으로 선택/시작할 때 `timerMode`를 DB에 저장 (기록 API는 모드를 변경하지 않음)
- **타이머 충돌 방지**: 한 번에 하나의 타이머만 실행 가능 (모든 태스크에 적용)
- **완료된 태스크**: 타이머 시작 불가, 토스트 메시지 표시 (한 번만 표시)
- **리셋 버튼**: 모든 기록 삭제 + 타이머 초기 화면으로 이동 (홈이 아닌 모드 선택 화면)
- **Phase별 배경색**: 
  - 집중(Flow): 검정
  - 휴식(Break): 에메랄드 (뽀모도로와 일반 타이머 동일)
- **홈 화면 표시**:
  - 아이콘: Clock(집중), Stop(휴식)
  - 색상: 일반(초록), 뽀모도로(빨강)
  - 시간 표시:
    - 집중 중: 전체 누적 집중 시간 (MM:SS 형식)
    - 추천 휴식 중: 카운트다운 (남은 시간)
    - 자유 휴식 중: 카운트업 (경과 시간)
    - 완료된 태스크: 전체 누적 집중 시간 (MM:SS 형식)
  - 실시간 업데이트 (일시정지 상태도 반영)
- **타이머 완료 시 알림음**
- **localStorage 저장**: 페이지 새로고침/재실행 후에도 상태 유지
- **도트 디자인**:
  - 작은 도트: `h-2.5 w-2.5`, `rounded-full`, `shadow-sm`
  - 긴 도트: `h-3 w-10`, `rounded-full`, `shadow-md`, `overflow-hidden` (프로그레스바 포함)
  - 프로그레스바: `bg-gradient-to-r from-emerald-500 to-emerald-400`, `shadow-emerald-500/50`
  - 간격: `gap-2.5`

---

## 6. 데이터 영속성

### 개발 환경 (MSW)
- localStorage에 데이터 저장
- 새로고침해도 유지
- 키(MSW): `flowmate/{clientId}/todos`, `flowmate/{clientId}/settings`
- 타이머 상태: `flowmate/{clientId}/timer/v2/{todoId}`
- 세션 히스토리: `flowmate/{clientId}/sessionHistory/{todoId}`
- 레거시 분리 키: `flowmate/{clientId}/settings/pomodoroSession`, `flowmate/{clientId}/settings/automation`, `flowmate/{clientId}/settings/miniDays` → 결합 키로 마이그레이션
- 레거시 키(`todo-flow/...`)는 최초 로드 시 `flowmate/...`로 마이그레이션
- 참고: sessionHistory는 현재 localStorage에 저장되며, 서버 저장으로 이관 예정
- 키 규칙은 `src/lib/storageKeys.ts`에서 관리

### 프로덕션
- 백엔드 API 연동 예정

---

## 7. 실행 방법

```bash
# 의존성 설치
cd frontend && pnpm install

# 개발 서버 (MSW 모킹, 기본 포트 5173)
pnpm dev:mock

# 개발 서버 (실제 API, 기본 포트 5173)
pnpm dev

# 포트 지정하여 실행 (MSW 모킹)
pnpm dev:mock:port 1019

# 포트 지정하여 실행 (실제 API)
pnpm dev --port 1019

# 프로덕션 빌드
pnpm build

# 빌드 미리보기
pnpm preview

# 테스트
pnpm test
```

### 포트 지정 주의사항

- **MSW 사용 시**: `pnpm dev:mock:port [포트번호]` 사용
  - MSW가 활성화되어 `/api` 요청을 가로채서 모킹 데이터를 반환합니다.
  - 백엔드 서버가 없어도 동작합니다.

- **실제 API 사용 시**: `pnpm dev --port [포트번호]` 사용
  - 실제 백엔드 서버가 실행 중이어야 합니다.
  - `VITE_API_BASE_URL` 환경 변수로 API 서버 주소를 지정할 수 있습니다.

- **1024 이하 포트**: 시스템 권한이 필요할 수 있어 `sudo`가 필요할 수 있습니다.

---

## 8. 환경 변수

```env
VITE_API_BASE_URL=/api
VITE_USE_MOCK=1
```

---

## 9. 테스트

| 파일                 | 내용                                    |
| -------------------- | --------------------------------------- |
| `timerStore.test.ts` | 타이머 phase 전환, pause/resume/restore |
| `api.test.ts`        | Todo CRUD, Settings API (MSW)           |

```bash
pnpm test      # 전체 테스트
pnpm test:watch   # watch 모드
```
