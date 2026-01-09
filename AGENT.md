# AGENT Guide

## 목적
- Todo + Pomodoro MVP 작업 시 에이전트가 따라야 할 최소 가이드와 참조 경로를 제공한다.

## 로드맵 (Frontend → Backend → Deploy)
- 완료
  - [x] Plan 문서 정리(PRD/Design/API) — `docs(plan): update plan (prd/design/api)`
  - [x] Backend/Frontend 계획 문서 — `docs(backend): update backend plan`, `docs(frontend): add frontend plan`
  - [x] AGENT 가이드 — `docs: add AGENT guide`
- 1단계 Frontend
  - [ ] 스캐폴딩(Vite/Router/Query/Zustand/Tailwind) — `feat(frontend): scaffold app shell`
  - [ ] MSW 모킹 세팅(정상/에러) — `chore(frontend): add msw mocks`
  - [ ] 타이머 store/로직(endAt, 단일 활성, 보정) — `feat(frontend): add timer store and completion flow`
  - [ ] 페이지 구현(Todos/Settings/Timer) + 상태/검증 — `feat(frontend): build pages and forms`
  - [ ] 프론트 통합 테스트(MSW) — `test(frontend): add integration coverage`
- 2단계 Backend
  - [ ] 스캐폴딩(Spring Boot, MySQL/H2, Flyway) — `feat(backend): scaffold api baseline`
  - [ ] Flyway V1 마이그레이션(todos, pomodoro_settings) — `chore(backend): add flyway V1 init`
  - [ ] Todo/Settings/Complete API 구현 및 테스트 — `feat(backend): implement todo/settings api`
  - [ ] 백엔드 슬라이스/서비스 테스트 — `test(backend): add service/controller tests`
- 3단계 배포/운영
  - [ ] 빌드/배포 파이프라인(frontend 정적 호스팅, backend Jar) — `chore: add build/deploy pipeline`
  - [ ] 프로필/환경 변수(dev/prod: MySQL/H2, API base URL, USE_MOCK) — `chore: add env profiles`
  - [ ] 운영 체크리스트(로그 레벨, CORS, 헬스체크, DB 연결) — `chore(ops): add ops checklist`

## 참고 문서
- PRD: docs/plan/prd.md
- Design: docs/plan/design.md
- API Spec: docs/plan/api.md
- Frontend Plan: docs/frontend.md
- Backend Plan: docs/backend.md

## 기술 스택/환경
- Frontend: Vite + pnpm, React 18 + TS, React Router, TanStack Query, Zustand(타이머), Tailwind, react-hook-form + zod, Vitest + @testing-library/react, date-fns, clsx
- Backend: Spring Boot, Web, Validation, Data JPA, Flyway, DB: MySQL(prod) / H2(dev)
- 공통: 단일 사용자(`userId="local"`), 인증 없음(MVP)

## 데이터 모델(요약)
- Todo: id, userId, title, note?, isDone, pomodoroDone, focusSeconds, createdAt, updatedAt
- PomodoroSettings: userId, flowMin, breakMin, longBreakMin, cycleEvery
- `pomodoroTarget`는 사용하지 않는다.

## 핵심 원칙
- 타이머는 클라이언트에서 관리(endAt 기준). 서버는 완료 누적만 담당.
- 단일 활성 타이머 권장(멀티 탭 동시 실행 차단/경고).
- 설정은 타이머 시작 시 스냅샷 적용; 실행 중 변경은 반영하지 않음.
- `visibilitychange` 시 남은 시간 재계산으로 정확도 보정.
- 모킹: 개발 시 MSW 선택적 사용, `USE_MOCK` 플래그로 전환.

## API 요약
- Todos: GET/POST/PATCH/DELETE `/api/todos`
- Settings: GET/PUT `/api/settings/pomodoro`
- Completion: POST `/api/todos/{id}/pomodoro/complete` (body: {"durationSec": number})
- 에러 포맷 권장: `{error:{code,message,fields}}`

## 검증/유효성
- title: 1~200자
- settings: flowMin 1~180, breakMin 1~60, longBreakMin 1~120, cycleEvery 1~12
- durationSec: 권장 1~10800

## 작업 지침
- 변경 전후 관련 문서/코드 일관성 확인(데이터 모델, DB 타입, API 스펙).
- 타이머 로직 수정 시: endAt 계산, 스냅샷, 단일 활성, 보정 로직 검토.
- 백엔드: Flyway 마이그레이션 업데이트 시 MySQL 기준(UTF8MB4, InnoDB) 유지.
- 프론트: Query/Zustand 상태 업데이트 후 필요한 invalidate/rollback 처리 확인.
- 에러 처리: 통일 포맷 준수, 필요한 경우 토스트/재시도 UX 반영.

## 커밋/브랜치
- 커밋 메시지 포맷: `<type>(<scope>): <summary>`
  - 문서/플랜: `docs(plan): update plan (prd/design/api)`
  - 프론트엔드: `feat(frontend): add timer store`
  - 백엔드: `feat(backend): add pomodoro complete endpoint`
- 브랜치 전략은 팀 규칙에 따르되, 문서/코드 변경 범위를 메시지에 명확히 표기.
- 브랜치 전략은 팀 규칙에 따르되, 문서/코드 변경 범위를 메시지에 명확히 표기.

## 테스트
- 프론트: 타이머 전이/remaining 계산, CRUD 훅 + MSW 통합 테스트(정상/실패 간단 케이스)
- 백엔드: Service/Repository 단위 테스트, Controller 슬라이스로 Todos/Settings/Complete 해피 패스
