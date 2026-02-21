# Frontend

## 개요

FlowMate 프론트엔드 - React 19 + TypeScript 기반 생산성 웹 앱

## 기술 스택

- **Framework**: React 19, TypeScript, Vite
- **상태 관리**: TanStack Query (서버) + Zustand (타이머)
- **스타일**: Tailwind CSS 4.x
- **폼**: react-hook-form + Zod
- **테스트**: Vitest + Testing Library
- **모킹**: MSW (Mock Service Worker)

## 빠른 시작

### 요구사항

- Node.js 22.12.0 (`.nvmrc` 참고)
- pnpm 8+

### 실행

```bash
# 의존성 설치
pnpm install

# 실서버 연동 모드
pnpm dev

# MSW 모킹 모드
pnpm dev:mock

# 브라우저에서 http://localhost:5173 접속
```

## 환경 변수

`.env.local` 파일에서 설정:

- `VITE_USE_MOCK`: MSW 사용 여부
  - `1` 또는 `true`: MSW 모킹 활성화
  - 그 외: 실제 API 호출
- `VITE_API_BASE_URL`: 백엔드 API URL
  - 로컬: `http://localhost:8080/api`
  - 프로덕션: 배포 URL
- `VITE_ENABLE_PWA`: PWA 활성화 여부
  - 기본값: 활성화(`true`)
  - `0` 또는 `false`: 서비스워커 등록/생성 비활성화

## 디렉토리 구조

```
src/
├── api/          # API 클라이언트 (zod 검증)
│   ├── http.ts       # fetch 래퍼, 에러 처리
│   ├── todos.ts      # Todo/Session API
│   ├── settings.ts   # Settings API
│   └── reviews.ts    # Review API
├── app/          # 라우터, 프로바이더
│   ├── App.tsx
│   ├── routes.tsx
│   └── queryClient.ts
├── features/     # 도메인별 기능 모듈
│   ├── todos/        # Todo 관리
│   ├── timer/        # 타이머 (Zustand store)
│   ├── review/       # 회고 (일/주/월)
│   └── settings/     # 설정
├── ui/           # 공통 UI 컴포넌트
│   ├── Button.tsx
│   ├── Calendar.tsx
│   └── BottomSheet.tsx
├── lib/          # 유틸리티
│   ├── time.ts
│   ├── constants.ts
│   └── clientId.ts
└── mocks/        # MSW 핸들러
    ├── handlers.ts
    └── browser.ts
```

## 상태 관리 전략

### 서버 상태 (TanStack Query)

- **대상**: Todo, Session, Settings, Review
- **캐싱**: `staleTime`, `gcTime` 정책 활용
- **낙관적 업데이트**: Todo 완료, Session 생성 시 즉시 반영

### 클라이언트 상태 (Zustand)

- **타이머 실행 상태**: `remainingMs`, `phase`, `endAt`
- **영속화**: localStorage 자동 동기화
- **복원**: 페이지 새로고침 시 타이머 상태 복원

### 집계 정본 (Single Source of Truth)

- ✅ **서버**: `todo.sessionCount`, `todo.sessionFocusSeconds`
- 📦 **로컬**: 동기화 버퍼 (UI 표시용, 서버 저장 전까지만 사용)

> 타이머 완료 시 서버 Session API 호출로 최종 수렴

## API 연동

### HTTP 클라이언트

- **파일**: `src/api/http.ts`
- **기능**: fetch 래퍼, zod 파싱, 표준 에러 처리
- **헤더**: `X-Client-Id` 자동 추가 (게스트 식별)

### 엔드포인트별 클라이언트

- `src/api/todos.ts`: Todo CRUD + Session 생성/조회
- `src/api/settings.ts`: Pomodoro/Automation/MiniDays 설정
- `src/api/reviews.ts`: 회고 조회/생성/삭제

### 멱등성 보장

Session 생성 시 `clientSessionId(UUID)` 포함하여 중복 방지:

```typescript
await todoApi.createSession(todoId, {
  sessionFocusSeconds: 1500,
  breakSeconds: 300,
  clientSessionId: generateSessionId(), // UUID
})
```

## 테스트

```bash
# ESLint
pnpm lint

# 단위 테스트 (Vitest)
pnpm test

# 테스트 watch 모드
pnpm test:watch

# 프로덕션 빌드
pnpm build

# 빌드 미리보기
pnpm preview
```

### 테스트 파일

- `src/**/*.test.ts(x)`: 단위 테스트
- 현재 커버리지: 12개 테스트 파일
  - 타이머 로직 (timerStore, timerPersistence)
  - 회고 유틸 (reviewUtils, reviewRouteParams)
  - API 클라이언트 (api.test.ts)

## 주요 기능

### 1. Todo 관리

- 날짜별 할 일 생성/수정/삭제
- 미니 데이 섹션 (미분류/오전/오후/저녁)
- 드래그 앤 드롭 정렬 (@dnd-kit)

### 2. 타이머

- **일반 타이머**: 카운트업 + 휴식 추천
- **뽀모도로**: 25분 집중 + 5분 휴식
- 상태 영속화 (localStorage)
- 멱등 세션 생성

### 3. 회고

- 일일/주간/월간 통계
- 완료/미완료 타임라인
- 회고 작성/수정

### 4. 설정

- 타이머 시간 커스터마이징
- 자동 시작 설정
- 미니 데이 라벨/시간대 변경

## 관련 문서

- [API 계약](../docs/plan/api.md): 프론트-백 정합 단일 소스
- [데이터 모델](../docs/plan/data.md): DB 스키마, 인덱스
- [프로젝트 개요](../README.md): 전체 아키텍처
- [백엔드 가이드](../backend/README.md): API 서버 실행

## 트러블슈팅

### 포트 충돌

```bash
# 5173 포트 사용 프로세스 확인
lsof -i :5173

# 프로세스 종료
kill -9 <PID>
```

### MSW 동작 안 함

1. `public/mockServiceWorker.js` 파일 확인
2. 브라우저 개발자 도구 → Console → `[MSW]` 로그 확인
3. 필요 시 재생성: `pnpm dlx msw init public/`

### 타이머 상태 리셋

```bash
# localStorage 초기화
# 브라우저 개발자 도구 → Application → Local Storage → Clear
```
