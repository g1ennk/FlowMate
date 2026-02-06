# Frontend Guide

## 목적
- FlowMate 프론트엔드 구조/실행/연동 기준 문서
- API 계약의 단일 소스는 `docs/plan/api.md`

## 기술 스택
- React 19 + TypeScript + Vite
- TanStack Query, Zustand
- react-hook-form + zod
- Tailwind CSS
- Vitest + Testing Library + MSW

## 실행
```bash
cd frontend
pnpm install
pnpm dev
```

## 환경 변수
- `VITE_USE_MOCK`
  - `1` 또는 `true`: MSW 사용
  - 그 외: 실 API 호출
- `VITE_API_BASE_URL`
  - 로컬 실서버 연동: `http://localhost:8080/api`
  - 테스트(MSW): `/api`

## 테스트
```bash
cd frontend
pnpm lint
pnpm test
pnpm build
```

## API 연동 포인트
- `src/api/http.ts`: 공통 fetch 래퍼, zod 파싱, 에러 표준화
- `src/api/todos.ts`: Todo/Session/Reset API
- `src/api/settings.ts`: Settings API
- `src/api/reviews.ts`: Review API

## 날짜 쿼리 규칙
- 작업 캘린더(Todo 목록): `GET /api/todos?date=YYYY-MM-DD`는 선택값
  - date를 생략하면 사용자 전체 Todo를 반환
- 회고(Review): 기간 기준 조회라서 date 계열 파라미터가 필수
  - 단건 조회: `type + periodStart`
  - 범위 조회: `type + from + to`

## 상태 관리 요약
- 서버 상태: TanStack Query
- 타이머 실행 상태(ms): Zustand + localStorage
- 세션 기록(초): 백엔드 API로 저장
