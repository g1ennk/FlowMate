# Frontend

> 상태: current
> 역할: FlowMate 프론트엔드 실행/구조 가이드. API 계약 정본은 `../docs/plan/api.md`다.

## 개요

FlowMate 프론트엔드는 React 19 + TypeScript 기반 생산성 웹 앱이다.  
Todo, 타이머, 회고, 설정 UI를 제공하고, 인증은 guest/member 모두 Bearer JWT로 통일한다.

## 기술 스택

- React 19
- TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Tailwind CSS 4
- react-hook-form + zod
- Vitest + Testing Library
- MSW
- `vite-plugin-pwa`

## 빠른 시작

### 요구사항

- Node.js 22.12.0
- pnpm 8+

### 실행

```bash
pnpm install

# 실서버 연동
pnpm dev

# MSW 모킹
pnpm dev:mock
```

기본 접속 주소는 `http://localhost:5173`이다.

## 환경 변수

주요 env 파일:

- `.env.local`: 로컬 개발용
- `.env.dev`: dev 배포 빌드용
- `.env.prod`: prod 배포 빌드용
- `.env.test`: 테스트용

주요 변수:

- `VITE_USE_MOCK`
  - `1` 또는 `true`: MSW 활성화
  - 그 외: 실제 API 호출
- `VITE_API_BASE_URL`
  - 로컬 예시: `http://localhost:8080/api`
  - 배포 예시: `https://api.dev.flowmate.io.kr/api`
- `VITE_ENABLE_PWA`
  - 기본값: 활성화
  - `0` 또는 `false`: 서비스워커 비활성화

## 디렉토리 구조

```txt
src/
├── api/            # fetch 래퍼, endpoint client, zod schema
├── app/            # 라우터, 프로바이더, QueryClient
├── features/
│   ├── auth/       # 로그인/콜백
│   ├── boarding/   # 온보딩
│   ├── todos/      # Todo 화면과 액션
│   ├── timer/      # Zustand 타이머 store/hydration/sync
│   ├── review/     # 회고 화면
│   └── settings/   # 설정 화면
├── store/          # authStore
├── ui/             # 공통 UI 컴포넌트
├── lib/            # 공용 유틸
└── mocks/          # MSW 핸들러
```

`src/lib/clientId.ts`는 API 인증용 식별자가 아니라, 일부 로컬 캐시/MSW 스토리지 네임스페이스 호환성에만 사용한다.

## 인증/상태 관리

### 인증 모델

- 게스트
  - 앱 초기화 시 `/api/auth/refresh` 실패 후 guest token 확인/발급
  - guest token은 localStorage에 저장
  - 모든 API 요청은 `Authorization: Bearer {guestToken}`
- 회원
  - 카카오 로그인 후 access token과 user 정보를 메모리(Zustand state)에만 저장
  - `refreshToken`은 HttpOnly 쿠키
  - 401 발생 시 `/api/auth/refresh`로 1회 재시도

### 서버 상태

- TanStack Query 사용
- 정본 데이터: Todo, Session, Settings, Review
- 기본 정책: `staleTime=30s`, `gcTime=5m`, `retry=1`

### 클라이언트 상태

- 타이머 실행 상태: Zustand
- 회원은 앱 초기화 시 `GET /api/timer/state`로 active 타이머를 복원한다
- 회원은 `useSseTimerSync()`로 `EventSource(/api/timer/sse?token=...)`를 열고, 상태 전환을 `PUT /api/timer/state/{todoId}`로 동기화한다
- SSE 스트림은 `connected`, `heartbeat`, `timer-state` 이벤트를 보낸다
  - `timer-state`만 실제 store 반영 대상이다
  - `connected`, `heartbeat`는 keepalive 이벤트로 무시 가능하다
- 게스트는 서버 타이머 복원 없이 현재 탭의 메모리 상태로만 동작한다
- 세션 집계 정본은 서버이며, 프론트의 메모리 상태는 UI/동기화 보조 용도다

## API 연동

### HTTP 클라이언트

- 파일: `src/api/http.ts`
- 헤더: `Authorization: Bearer {token}`
- `credentials: 'include'`로 refresh cookie 전송
- 표준 에러 응답 파싱
- 401 시 refresh 후 1회 재시도

### 엔드포인트 클라이언트

- `src/api/todos.ts`: Todo CRUD + Session 조회/생성
- `src/api/timerApi.ts`: member 타이머 상태 조회/저장
- `src/api/settings.ts`: Settings 조회/수정
- `src/api/reviews.ts`: Review 조회/업서트/삭제

### TimerSyncLayer

- `src/app/AppProviders.tsx`의 `TimerSyncLayer`가 아래 세 가지를 묶는다.
- `useTimerSyncEffect()`: 완료 세션을 Session API와 수렴
- `useSseTimerSync()`: member SSE 연결 + 상태 push/remote apply
- `useInitialTimerFetch()`: 앱 시작 시 member active timer hydrate
- `useSseTimerSync()`는 원격 상태 적용 중 `_applyingRemote` 경로를 통해 PUT 루프를 막는다

### 멱등성

Session 생성 시 `clientSessionId`를 포함한다.

```ts
await todoApi.createSession(todoId, {
  sessionFocusSeconds: 1500,
  breakSeconds: 300,
  clientSessionId: crypto.randomUUID(),
})
```

## 테스트

```bash
pnpm lint
pnpm test
pnpm test:watch
pnpm build
pnpm preview
```

현재 저장소의 프론트 테스트 파일은 아래 7개다.

- `src/app/AppLayoutGate.test.tsx`
- `src/features/auth/AuthCallback.test.tsx`
- `src/features/auth/LoginPage.test.tsx`
- `src/features/settings/PomodoroSettingsPage.test.tsx`
- `src/features/timer/TimerFullScreen.test.tsx`
- `src/features/timer/sseAuth.test.ts`
- `src/features/todos/TodosPage.test.tsx`

## 주요 기능

### Todo 관리

- 날짜별 할 일 생성/수정/삭제
- 미니 데이 섹션 정렬
- 드래그 앤 드롭 정렬

### 타이머

- 일반 타이머: 카운트업 + 추천/자유 휴식
- 뽀모도로: Flow/Short Break/Long Break
- 회원은 서버 복원 + SSE 기반 크로스 디바이스 동기화
- 게스트는 현재 탭의 메모리 상태로만 동작
- 서버 Session API로 최종 집계 수렴

### 회고

- 일간/주간/월간 통계
- 완료/미완료 타임라인
- 회고 작성/수정/삭제

### 설정

- 뽀모도로 시간 커스터마이징
- 자동 시작 옵션
- 미니 데이 라벨/시간대 수정
- PWA 설치 카드

## 관련 문서

- [API 계약](../docs/plan/api.md)
- [데이터 모델](../docs/plan/data.md)
- [프로젝트 개요](../README.md)
- [백엔드 가이드](../backend/README.md)

## 트러블슈팅

### 포트 충돌

```bash
lsof -i :5173
kill -9 <PID>
```

### MSW가 동작하지 않음

1. `public/mockServiceWorker.js` 존재 여부 확인
2. 브라우저 Console의 `[MSW]` 로그 확인
3. 필요 시 `pnpm dlx msw init public/`

### 인증 상태를 초기화하고 싶음

브라우저 개발자 도구의 Local Storage에서 `flowmate/auth/guest-token`, `flowmate/auth/mode`, `flowmate/onboarding/seen` 같은 키를 정리한 뒤 새로고침한다.
