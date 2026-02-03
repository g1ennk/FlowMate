# Repository Guidelines

## 프로젝트 구조 & 모듈 구성
- `frontend/`: React + TypeScript 앱
  - `src/app/`: 앱 셸, 라우트, 프로바이더
  - `src/features/`: 도메인 단위 모듈 (`todos`, `timer`, `settings` 등)
  - `src/ui/`: 공통 UI 컴포넌트
  - `src/api/`: API 클라이언트와 타입
  - `src/mocks/`: MSW 핸들러 및 목 서버
  - `src/lib/`: 공용 유틸/상수
- `backend/`: Spring Boot 서비스 예정 (현재 비어 있음)
- `docs/`: 기획/구현 문서
  - `apps/`: 앱별 문서 (frontend/backend/infra)
  - `plan/`: PRD/API/Data Model
- `infra/`: 배포/인프라 설정 (예정)
- `images/`: 문서용 이미지 자산

## 빌드/테스트/개발 명령어
`frontend/`에서 실행:
- `pnpm install`: 의존성 설치
- `pnpm dev`: Vite 개발 서버 (실 API)
- `pnpm dev:mock`: MSW 모킹 서버 (`VITE_USE_MOCK=1`)
- `pnpm dev:port 1019`: 포트 지정 실행
- `pnpm build`: 타입 체크 + 프로덕션 빌드
- `pnpm preview`: 프로덕션 빌드 프리뷰
- `pnpm lint`: ESLint 실행
- `pnpm test`: Vitest 1회 실행 (CI용)
- `pnpm test:watch`: Vitest watch 모드

## 코딩 스타일 & 네이밍 규칙
- TypeScript + React, 스타일은 Tailwind 사용.
- 들여쓰기 2칸, 작은따옴표, 세미콜론 없음(기존 스타일 준수).
- ESLint 설정: `frontend/eslint.config.js` (`pnpm lint` 권장).
- 컴포넌트 파일명: PascalCase (예: `TimerFullScreen.tsx`).
- 훅/유틸 함수: camelCase, 훅은 `useX` 접두사.
- 테스트: 소스와 동일 경로에 `*.test.ts` / `*.test.tsx`로 배치.

## 테스트 가이드
- Vitest + Testing Library, JSDOM 환경, API 모킹은 MSW 사용.
- 단위 테스트는 `frontend/src/**` 내에 두고 파일명은 `*.test.ts`.
- 수동/QA 체크 문서는 현재 별도 파일 없음 (필요 시 추가).

## 커밋 & PR 가이드
- Conventional Commits 사용: `type(scope): summary` (예: `fix(frontend): ...`, `docs: ...`).
- 커밋은 하나의 변경 목적에 집중.
- PR에는 변경 요약, 실행한 테스트, UI 변경 시 스크린샷/GIF 포함. 관련 이슈 링크와 모킹/실 API 여부도 명시.
