# Design Spec – Project Architecture (MVP)

프로젝트 전반(프론트+백엔드)의 최소 설계 문서입니다. PRD(`docs/plan/prd.md`)의 범위를 구현하는 데 필요한 구조만 간단히 정의합니다.

## 1. Scope & Goals
- 단일 로컬 사용자 Todo+Pomodoro 웹앱을 빠르게 완성할 수 있는 전체 아키텍처 정의
- 클라이언트 타이머, 서버는 결과 누적만 담당하는 책임 분리
- 추후 인증/다중 유저 확장 가능하도록 최소한의 계층화

## 2. System Overview
- Frontend: CSR SPA (React 18, Vite), 클라이언트 타이머, REST API 소비
- Backend: Spring Boot REST API, MySQL(prod) / H2(dev) + Flyway 마이그레이션
- Timer: 클라이언트 endAt 기반, 서버는 완료 누적 API만 제공

## 3. High-Level Structure
- Client: React Router `/todos`, `/timer/:todoId`, `/settings/pomodoro` + 상태(Query + Zustand)
- API 경계: `/api/todos`, `/api/settings/pomodoro`, `/api/todos/{id}/pomodoro/complete`
- Server: Controller → Service → Repository(JPA) → DB(MySQL prod / H2 dev)
- Data: Todo, PomodoroSettings 두 테이블

## 4. Frontend Design (요약)
- Stack: Vite + pnpm, React 18 + TS, React Router, TanStack Query, Zustand(타이머), Tailwind, react-hook-form + zod
- Timer 상태: `phase`, `endAt`, `todoId`, `cycleCount`, `settingsSnapshot`, `status`; sessionStorage에 스냅샷 저장/복구
- 모킹: 개발 시 MSW 선택적 사용(`USE_MOCK` 플래그)
- API 클라이언트: baseURL 래퍼 + zod 응답 검증, 단순 에러 토스트

## 5. Backend Design (요약)
- Stack: Spring Boot, Web, Data JPA, Flyway, MySQL(H2 dev)
- 계층: Controller(REST) → Service(도메인 로직) → Repository(JPA) → Entity
- 엔드포인트: PRD 8장 명세 그대로 사용
  - Todos: GET/POST/PATCH/DELETE `/api/todos`
  - Settings: GET/PUT `/api/settings/pomodoro`
  - Complete: POST `/api/todos/{id}/pomodoro/complete` (durationSec 반영)
- 검증: 요청 DTO에 Bean Validation (범위는 PRD 검증 규칙 준수)
- 에러: 단순 JSON `{message, code?}` 형태(400/404/500)

## 6. Data Model (공유 개념)
- Todo: id(UUID), userId("local"), title, note?, isDone, pomodoroDone, focusSeconds, createdAt, updatedAt
- PomodoroSettings: userId(PK, "local"), flowMin, breakMin, longBreakMin, cycleEvery

## 7. 환경 변수
- Frontend: `VITE_API_BASE_URL`, `USE_MOCK`
- Backend: `PORT`(기본 8080), `SPRING_PROFILES_ACTIVE`, DB URL/USER/PW (prod=MySQL, dev=H2), Flyway 설정

## 8. Build & Deploy (MVP 기준)
- Frontend: `pnpm build` → 정적 호스팅(또는 Nginx) 배포
- Backend: `./gradlew bootJar` → 단일 Jar 실행; DB 마이그레이션은 Flyway 자동 적용

## 9. 테스트 (필수 최소)
- Frontend: 타이머 phase 전이/remaining 계산, Todo CRUD 훅 MSW 통합 테스트 간단 시나리오
- Backend: Service/Repository 단위 테스트, Controller 슬라이스로 Todo/Settings/Complete happy path

## 10. 운영/비기능 (MVP 최소)
- 성능: 클라이언트 interval 1s, 서버 단순 CRUD
- 신뢰성: 단일 활성 타이머 권장(멀티 탭 동시 실행은 차단 또는 경고)
- 보안: 인증 없음(MVP), CORS는 프론트 도메인 허용; 추후 인증 시 미들웨어 추가
- 로깅/모니터링: 기본 로그 수준 info; 추가 관측은 추후 확장

## 11. 확장 여지 (요약)
- 인증/다중 사용자: userId 필드 유지, 추후 Spring Security/JWT 추가 가능
- 통계/대시보드: 완료 로그 테이블 추가, focusSeconds 집계 확장 가능
- 실시간/동기화: WebSocket/SSE는 현 스코프 밖, 필요 시 타이머 서버 관리로 전환
