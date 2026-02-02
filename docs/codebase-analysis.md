# Codebase Analysis (Frontend 중심)

## 0. 리뷰 순서 (요청 준수)
1) 문서(README/plan/spec) → 2) 코드 → 3) 문서 재확인 → 4) 코드 재확인 순으로 확인 완료.
- 본 문서는 **코드 변경 없이** 분석 결과를 정리한 문서이며, 갱신 대상은 문서만 포함됨.

## 1. 문서 역할 원칙
- `docs/codebase-analysis.md`: **요약 + 리스크**만 유지 (상세 동작/설명은 `docs/frontend.md`로 이동)
- `docs/frontend.md`: 프론트엔드 **상세 동작/UX 스펙**의 단일 소스
- `docs/backend.md`: 백엔드 구현 계획 (API 계약은 plan/api.md가 소스)

## 2. 핵심 아키텍처 요약
- **모노레포 구조**
  - `frontend/`만 구현됨 (React + Vite + TS). `backend/`는 계획 문서만 존재.
- **라우팅/앱 쉘**
  - React Router로 `/todos`, `/stats`, `/settings` 제공.
  - 타이머 UI는 라우트가 아닌 **풀스크린 오버레이**(`TimerFullScreen`)로 표시.
- **Todo UI 구조**
  - 하루를 Day 0~3으로 분리해 섹션별로 표시 (Day 0: 미분류, Day 1~3: 시간대)
- **상태 관리**
  - 서버 상태: TanStack Query (Todo/Settings CRUD, 완료/누적 API 호출)
  - 클라이언트 상태: Zustand(`timerStore`)로 모든 타이머 상태/전이/세션 히스토리 관리
- **API 계층**
  - `frontend/src/api/*`에서 Zod 검증 + fetch 래퍼 사용
- **모킹**
  - MSW 핸들러(`frontend/src/mocks`)가 localStorage 기반으로 Todo/Settings 저장
- **글로벌 타이머 Ticker**
  - `AppProviders`에서 `useTimerTicker()` 설치 (100ms 주기, visibilitychange 보정)

## 2.1 운영/개발 컨텍스트
- **현재 상태**
  - Frontend MVP 완료 (Todo + 타이머 + 통계)
  - Backend 미구현 (`backend/` 폴더만 존재)
  - API는 MSW 모킹으로 동작 가능
- **개발 환경**
  - Node.js 22.12.0 권장 (`.nvmrc`)
- **환경 변수**
  - `VITE_USE_MOCK=1`: MSW 모킹 활성화
  - `VITE_API_BASE_URL`: API 베이스 경로 (기본값 `/api`)
- **테스트/QA 핵심 체크**
  - 자동화: Vitest + Testing Library
  - 타이머 변경 시 확인: `endAt/remainingMs` 보정, `sessionHistory` 업데이트 흐름, `timerMode` 저장 타이밍
- **백엔드 로드맵 요약**
  - Spring Boot 3 + MySQL/H2 + Flyway 스캐폴딩 예정
  - Todo CRUD, Timer 완료/누적 API, Settings API 구현 계획
- **운영 주의**
  - 멀티 탭 동시 실행에 대한 강제 락 없음 (동일 브라우저 내 충돌 체크만 존재)
  - `sessionHistory`와 `focusSeconds`는 출처가 달라 통계 계산 시 우선순위 주의
  - 타이머 리셋은 `focusSeconds`, `pomodoroDone`, `timerMode`까지 초기화

## 3. 데이터 모델 요약
### 2.1 Todo (프론트 타입 기준)
- `id`, `title`, `note`, `date`, `isDone`, `miniDay`, `dayOrder`
- `pomodoroDone`, `focusSeconds`, `timerMode`
- `createdAt`, `updatedAt`

### 2.2 PomodoroSettings
- `flowMin`, `breakMin`, `longBreakMin`, `cycleEvery`
- `autoStartBreak`, `autoStartSession`

### 2.3 Timer 상태 (Zustand SingleTimerState)
- **공통**: `mode`, `phase`, `status`, `endAt`, `remainingMs`, `elapsedMs`, `initialFocusMs`, `cycleCount`, `settingsSnapshot`
- **Flexible(Stopwatch) 전용**:
  - `flexiblePhase`, `focusElapsedMs`, `breakElapsedMs`, `breakTargetMs`, `breakCompleted`
  - `focusStartedAt`, `breakStartedAt`
  - `sessionHistory: { focusMs, breakMs }[]`

### 2.4 로컬 저장소 키
- 타이머 상태: `flowmate/{clientId}/timer/v2/{todoId}`
- 세션 히스토리: `flowmate/{clientId}/sessionHistory/{todoId}`
- 게스트 사용자 ID: `flowmate/client-id`
- MSW 모킹 데이터:
  - Todos: `flowmate/{clientId}/todos`
  - Settings: `flowmate/{clientId}/settings`
- Mini Days 설정: `flowmate/settings/miniDays`
- 레거시 키(`todo-flow/...`)는 최초 로드 시 `flowmate/...`로 마이그레이션

### 2.5 SessionHistory 운영/개선 요약
- `sessionHistory`는 **클라이언트 localStorage에만 영구 저장**되며 API 응답에는 포함되지 않음
- 기록 시점
  - Pomodoro: Flow/Break 완료 시 세션 추가 및 마지막 break 업데이트
  - Stopwatch: 휴식 시작 시 focus 기록, 집중 재개 시 break 기록 (완료 시 보정)
- 통계 계산은 **sessionHistory 우선**, 없으면 `focusSeconds` 사용
- 개선 방향(미구현)
  - 세션 기록 로직을 헬퍼로 통일(add/update/validate)하여 중복 제거
  - `MIN_FLOW_MS` 기준 필터링/합계 계산 유틸 강화
  - 서버 이관 시 `todo_sessions` 테이블로 단계적 마이그레이션, localStorage는 백업 유지

## 4. 타이머 로직 요약 (핵심 동작)
### 4.1 Pomodoro (카운트다운)
- `startPomodoro` → `endAt = now + flowMin`
- `tick()`에서 `remaining <= 0`이면 `completePhase()` 호출
- `completePhase()`
  - **Flow 완료**: 실제 경과 시간 계산 → `sessionHistory`에 {focusMs, breakMs:0} 추가 → Break 전환
  - **Break 완료**: 마지막 세션의 `breakMs` 업데이트 → Flow 전환 (long break 후 cycle reset)
- 완료 시점의 실제 서버 반영은 **autoCompletedTodos** + `TimerFullScreen` effect에서 API 호출

### 4.2 Stopwatch (카운트업 + 유연한 휴식)
- `startStopwatch`는 `flexiblePhase = focus`로 시작
- `startBreak`:
  - 현재 세션 집중 시간 계산 (`focusElapsedMs - initialFocusMs`)
  - **MIN_FLOW_MS 이상이면** sessionHistory에 추가
  - 휴식 시작: `break_suggested`(추천) 또는 `break_free`(자유)
- `resumeFocus`:
  - 마지막 세션의 `breakMs` 갱신
  - autoStartSession 여부에 따라 `running` or `waiting`
- `tick()`:
  - focus/break 카운트업
  - 추천 휴식 target 도달 시 autoStartSession 반영

### 4.3 Flow 인정 기준
- `MIN_FLOW_MS` 이상 집중 시 Flow로 인정
- 현재 `MIN_FLOW_MS = 0`으로 문서/코드가 일치하며, 변경 시 문서 동기화 필요

### 4.4 완료 처리
- `completeTaskFromTimer()`가 **타이머 상태를 pause** 후 계산
- Stopwatch:
  - 현재 세션 기준으로 `completeTodo`(Flow 인정) 또는 `addFocus` 호출
  - sessionHistory 갱신 후 `updateTodo(isDone=true)`
- Pomodoro:
  - 남은 시간이 5초 미만이면 `completeTodo`, 아니면 `addFocus`
  - sessionHistory 갱신 후 `updateTodo(isDone=true)`

### 4.5 복원/보정
- `timerPersistence.hydrateState()`
  - 실행 중인 타이머는 `Date.now()` 기준으로 delta 보정
  - Pomodoro endAt이 이미 지났으면 타이머 초기화(세션만 유지)
- `useTimerTicker()`
  - 100ms interval
  - `visibilitychange` 시 `syncWithNow()`로 보정

## 5. 중요 이슈/리스크 정리
1) **MIN_FLOW_MS 변경 시 문서 동기화 필요**
   - 코드(`frontend/src/lib/constants.ts`)는 `MIN_FLOW_MS = 0`.
   - 값 변경 시 PRD/프론트 문서/통계 로직 설명을 함께 갱신해야 함.

2) **Pomodoro 자동 완료 API 호출 위치**
   - auto 완료(`autoCompletedTodos`) 처리 로직이 `TimerFullScreen`에만 존재.
   - 사용자가 타이머를 실행한 뒤 풀스크린을 닫으면 **자동 완료 API 호출이 누락될 가능성**.

3) **sessionHistory 우선 계산으로 인한 불일치 가능성**
   - 통계는 sessionHistory가 있으면 **focusSeconds를 무시**.
   - 짧은 세션이 `MIN_FLOW_MS` 미만일 경우 server에는 addFocus로 누적되지만
     sessionHistory가 갱신되지 않으면 총 집중 시간이 UI에서 누락될 수 있음.
   - 현재 `MIN_FLOW_MS = 0`이라 당장은 영향이 적으나, 값 변경 시 리스크 큼.

4) **timerMode 동기화 시점 혼재**
   - UI 주석은 “타이머 실제 시작 시만 저장”이라고 되어 있으나,
     `TimerFullScreen` 초기화에서도 `timerMode`를 PATCH함 (중복/의도 혼재).

5) **멀티 탭 동시 실행 제어 부재**
   - 스토어 단에서 “동일 브라우저 내 충돌”만 체크.
   - 멀티 탭/다중 세션 간 동기화 문제 가능.

6) **복원 시 타이머 만료 처리**
   - Pomodoro endAt이 지난 상태로 복원되면 즉시 초기화되어
     **자동 완료로 기록되지 않는** 케이스 발생 가능.

## 6. API 요약 (프론트 사용 기준)
- 모든 요청에 `X-Client-Id` 헤더 포함 (게스트 사용자 식별)
- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/:id`
- `PUT /api/todos/reorder`
- `DELETE /api/todos/:id`
- `POST /api/todos/:id/pomodoro/complete`
- `POST /api/todos/:id/focus/add`
- `POST /api/todos/:id/reset`
- `GET /api/settings/pomodoro`
- `PUT /api/settings/pomodoro`

## 7. 파일/폴더 맵 (빠른 탐색용)
- **앱 설정/라우팅**
  - `frontend/src/app/App.tsx`
  - `frontend/src/app/routes.tsx`
  - `frontend/src/app/AppProviders.tsx`

- **API/데이터 타입**
  - `frontend/src/api/http.ts`
  - `frontend/src/api/types.ts`
  - `frontend/src/api/todos.ts`
  - `frontend/src/api/settings.ts`

- **타이머 핵심**
  - `frontend/src/features/timer/timerStore.ts` (Zustand 로직)
  - `frontend/src/features/timer/TimerFullScreen.tsx` (UI/흐름 제어)
  - `frontend/src/features/timer/completeHelpers.ts` (완료 처리)
  - `frontend/src/features/timer/timerPersistence.ts` (localStorage)
  - `frontend/src/features/timer/useTimerTicker.ts` (100ms tick)
  - `frontend/src/features/timer/timerTypes.ts`

- **Todos/Stats**
  - `frontend/src/features/todos/TodosPage.tsx`
  - `frontend/src/features/todos/StatsPage.tsx`
  - `frontend/src/features/todos/statsUtils.ts`
  - `frontend/src/features/todos/useTodoActions.ts`

- **Settings**
  - `frontend/src/features/settings/PomodoroSettingsPage.tsx`
  - `frontend/src/features/settings/hooks.ts`

- **공통 유틸/상수**
  - `frontend/src/lib/constants.ts` (MIN_FLOW_MS 등)
  - `frontend/src/lib/time.ts`
  - `frontend/src/lib/queryKeys.ts`

- **모킹(MSW)**
  - `frontend/src/mocks/handlers.ts`
  - `frontend/src/mocks/browser.ts`

- **문서**
  - `docs/plan/*` (PRD/API)
  - `docs/frontend.md`
