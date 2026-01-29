# 프로젝트 개발/운영 가이드

## 목적
- 이 문서는 **내부 개발 참고용**입니다. 기여자 온보딩은 `AGENTS.md`를 우선 참고하세요.

## 문서 맵
- `AGENTS.md`: 기여자 가이드(간략)
- `docs/plan/prd.md`: 제품 요구사항
- `docs/plan/design.md`: UI/UX 설계
- `docs/plan/api.md`: API 명세(백엔드 구현 기준)
- `docs/frontend.md`: 프론트엔드 상세 가이드(일부 내용은 코드와 싱크 필요)
- `docs/backend.md`: 백엔드 계획
- `docs/frontend_test.md`: 테스트/체크리스트/버그 리포트

## 현재 상태
- **Frontend MVP 완료** (Todo + 타이머 + 통계)
- **Backend 미구현** (`backend/` 폴더만 존재)
- API는 **MSW 모킹**으로 동작

## 코드베이스 구조 (요약)
- `frontend/`: React + TypeScript + Vite 앱
- `backend/`: Spring Boot 예정
- `docs/`: 기획/가이드 문서
- `infra/`: 배포/인프라 구성 예정
- `images/`: 문서용 자산

## 프론트엔드 아키텍처 핵심
### 라우팅
- `/todos` Todo 목록
- `/stats` 통계
- `/settings/pomodoro` 설정
- 타이머는 `TimerFullScreen` 풀스크린 오버레이로 표시

### 상태 관리
- 서버 상태: TanStack Query (`useTodos`, `useCreateTodo`, `useUpdateTodo` 등)
- 클라이언트 상태: Zustand `timerStore`
  - `TimerMode`: `pomodoro` | `stopwatch`
  - `TimerPhase`: `flow` | `short` | `long`
  - `TimerStatus`: `idle` | `running` | `paused` | `waiting`
  - `FlexiblePhase`: `focus` | `break_suggested` | `break_free`

### 타이머 시스템 요약
- **Pomodoro**: 카운트다운 기반, `endAt`으로 남은 시간 계산
- **Stopwatch(일반 타이머)**: 카운트업 기반, `focus/break` 전환
- `useTimerTicker`가 **100ms 간격**으로 `tick()` 호출
- `visibilitychange` 이벤트에서 `syncWithNow()`로 시간 보정

### Flow 인정 기준
- `MIN_FLOW_MS`(현재 1분) 이상 집중 시 **Flow**로 인정
- 일반 타이머 완료 시:
  - Flow 기준 충족 → `pomodoroDone` 증가 API 사용
  - 미달 → 시간만 누적하는 API 사용
- 뽀모도로 완료 시:
  - 남은 시간 5초 미만이면 **완료 처리**
  - 그 외는 **시간만 누적** 처리

## 데이터 모델 (프론트 기준)
### Todo
- `id` (UUID), `title`, `note`, `date`, `isDone`
- `pomodoroDone`, `focusSeconds`, `timerMode`
- `createdAt`, `updatedAt`

### PomodoroSettings
- `flowMin`, `breakMin`, `longBreakMin`, `cycleEvery`
- `autoStartBreak`, `autoStartSession`

### 세션 히스토리
- `sessionHistory`: `{ focusMs, breakMs }[]`
- 통계 페이지는 **sessionHistory 우선**, 없으면 `focusSeconds` 사용

## API 요약 (프론트에서 사용하는 엔드포인트)
```
GET    /api/todos
POST   /api/todos
PATCH  /api/todos/:id
DELETE /api/todos/:id
POST   /api/todos/:id/pomodoro/complete
POST   /api/todos/:id/focus/add
POST   /api/todos/:id/reset
GET    /api/settings/pomodoro
PUT    /api/settings/pomodoro
```
- `durationSec`: 1 ~ 10800
- `timerMode`는 **완료 API가 아닌** `PATCH /todos/:id`로 동기화

## 환경 변수
- `VITE_USE_MOCK=1`: MSW 모킹 활성화
- `VITE_API_BASE_URL`: API 베이스 경로(기본값 `/api`)

## 로컬 저장소(영속성) 전략
- 타이머 상태: `localStorage` 키 `todo-flow/timer/v2/{todoId}`
- 세션 히스토리: `localStorage` 키 `todo-flow/sessionHistory/{todoId}`
- MSW 모킹 데이터:
  - Todos: `todo-flow/todos`
  - Settings: `todo-flow/settings`

## 테스트/QA
- 자동화: Vitest + Testing Library
- 수동/체크리스트: `docs/frontend_test.md`
- 타이머 핵심 변경 시 확인 사항:
  - `endAt`/`remainingMs` 계산 보정
  - `sessionHistory` 업데이트 흐름
  - `timerMode` 저장 타이밍

## 로드맵 (백엔드)
- Spring Boot 3 + MySQL/H2 + Flyway 스캐폴딩
- Todo CRUD, Timer 완료/누적 API 구현
- 설정 API + 에러 포맷 통일
- 테스트: Service/Repository/Controller 레벨

## 주의사항
- 멀티 탭 동시 실행에 대한 강제 락은 없음 (동일 브라우저 내 충돌 체크만 존재)
- `sessionHistory`와 `focusSeconds`는 **출처가 다를 수 있으므로** 통계 계산 시 우선순위 주의
- 타이머 리셋은 `focusSeconds`, `pomodoroDone`, `timerMode` 모두 초기화
