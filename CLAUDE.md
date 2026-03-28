# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 빌드 & 실행 커맨드

### Frontend (`frontend/` 디렉토리에서 실행)

```bash
pnpm dev              # 개발 서버 (Vite, localhost:5173 → 백엔드 8080 프록시)
pnpm dev:mock         # MSW 목 서버로 개발 (백엔드 없이)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint
pnpm test             # Vitest 단일 실행
pnpm test:watch       # Vitest watch 모드
```

### Backend (`backend/` 디렉토리에서 실행)

```bash
./gradlew bootRun --args='--spring.profiles.active=local'   # 로컬 개발 서버 (8080)
./gradlew test                                               # 전체 테스트
./gradlew test --tests "kr.io.flowmate.todo.service.TodoServiceTest"  # 단일 테스트 클래스
```

로컬 MySQL: `docker compose -f backend/docker-compose.local.yml up -d` (localhost:3306, user/pw: flowmate)

### Load Test (`agent/load-test/v1/` 에서 실행)

```bash
# 토큰 생성 (Node.js)
node scripts/generate-member-token-pool.js --count 3 --prefix smoke --secret <JWT_SECRET> --output tokens.json --sql-output users.sql
# k6 실행 (smoke 프로필)
k6 run --out experimental-prometheus-rw k6/baseline.js
```

## 아키텍처 개요

### 전체 구조

- **Frontend**: React 19 + Vite 7 + TypeScript 5.9 (strict) + Tailwind CSS 4 + PWA (프로덕션만)
- **Backend**: Spring Boot 4.0.2 + Java 21 + MySQL 8 + Flyway
- **인증**: 게스트 JWT(localStorage, 90일) → 카카오 OAuth → 멤버 JWT(메모리만, 15분) + HttpOnly refresh cookie(14일, RTR)
- **실시간 동기화**: SSE로 타이머 상태 멀티디바이스 동기화 (쿼리파라미터 토큰, EventSource 제약)
- **배포**: EC2 + Docker Compose (백엔드+MySQL+Alloy), S3 + CloudFront (프론트엔드)
- **모니터링**: Grafana Cloud (Prometheus→Mimir, Docker logs→Loki, OTLP→Tempo) + Alloy 수집기

### Backend 도메인 패키지 (`kr.io.flowmate`)

| 패키지        | 역할                                                                                                    |
|------------|-------------------------------------------------------------------------------------------------------|
| `auth`     | JWT 발급/검증, 카카오 OAuth (Strategy 패턴: `OAuthProvider` → `OAuthProviderRegistry`), Refresh Token Rotation |
| `todo`     | Todo CRUD, 리뷰 스케줄링 (review_round + original_todo_id 체인, 간격: 1→2→4→8→16→32일)                           |
| `timer`    | 타이머 상태 push/pull + SSE broadcast (`SseEmitterRegistry`), state_json=null 소프트삭제, version 단조증가          |
| `session`  | 포모도로/스톱워치 세션 기록 (client_session_id로 멱등성, break_seconds는 증가만 허용)                                       |
| `review`   | 주간/월간 회고 (ReviewType enum, user_id+type+period_start unique)                                          |
| `settings` | 포모도로 설정(flow/break/longBreak/cycle), 미니데이 구간 3개, 자동화 플래그                                              |
| `common`   | `GlobalExceptionHandler`, `@CurrentUser` + `CurrentUserArgumentResolver`, `ListResponse`, `ApiError` (Record) |
| `config`   | `SecurityConfig` (actuator health만 허용, JSON 401/403), `JwtAuthFilter` (단일 파싱), `CorsConfig`, `WebMvcConfig` |

패턴: Lombok `@RequiredArgsConstructor`, Entity에 `create()` static factory, `@PostConstruct`로 SecretKey 캐싱, `@CurrentUser` 어노테이션으로 userId 주입, `AuthenticationFailedException` → 401 매핑
DTO 전략: Response DTO = Record (불변), Request DTO = Lombok `@Getter @Setter` (Jackson setter 바인딩 + `@Valid` 호환). 예외: `ExchangeRequest`는 Record (필드 2개, setter 불필요)

### Frontend 구조 (`frontend/src/`)

- **`features/`**: 도메인별 슬라이스 (auth, todos, timer, review, settings, boarding, pwa) — 페이지·컴포넌트·훅·헬퍼 자체 포함
- **`store/`**: Zustand 전역 스토어 — `authStore` (게스트/멤버 인증 + 자동 refresh), `themeStore` (light/dark/system)
- **`api/`**: `http.ts` (fetch 래퍼 + Bearer 자동 주입 + 401 singleton refresh + Zod 검증), 도메인별 API 모듈 (todos, timerApi,
  reviews, settings)
- **`ui/`**: 커스텀 공통 컴포넌트 (BottomSheet, Calendar, Icons, Switch, InlineSegmentToggle)
- **`lib/`**: queryKeys 팩토리, storageKeys 중앙관리, 시간/사운드/미니데이 헬퍼
- **`mocks/`**: MSW 핸들러 (~900줄, localStorage 기반 persistence, `dev:mock` 모드용)

### 핵심 상태 관리 패턴

- **서버 상태**: TanStack React Query — 도메인별 커스텀 훅, optimistic update + rollback, `queryKeys.ts` 팩토리
- **타이머 상태**: Zustand `timerStore` (로컬) + SSE 수신 → `applyRemoteState()` 충돌 해결 + version 비교
- **인증 흐름**: `authStore.init()` → 게스트/멤버 복원 → `http.ts` 자동 토큰 주입, 401 시 singleton Promise로 중복 refresh 방지, 실패 시 게스트
  다운그레이드
- **음악**: `musicStore` — HTMLAudioElement 관리, 볼륨 localStorage 저장, 포커스 페이즈 자동 재생

### SSE 동기화 아키텍처

- 멤버 전용 (게스트 미지원), `?token={accessToken}` 쿼리 파라미터 인증
- 이벤트: `connected` (1회), `heartbeat` (~25초), `timer-state` (상태 변경 시)
- Nginx: `/api/timer/sse` 별도 location, proxy_buffering off, 1시간 타임아웃
- 서버: state 저장 → 같은 userId의 모든 SseEmitter에 broadcast

## 인프라 & 배포

### 환경 구성

| 환경    | 브랜치                   | 프론트엔드          | 백엔드            | 도메인                                         |
|-------|-----------------------|----------------|----------------|---------------------------------------------|
| local | -                     | localhost:5173 | localhost:8080 | -                                           |
| dev   | `develop` (자동)        | S3+CloudFront  | EC2 Docker     | dev.flowmate.io.kr / api.dev.flowmate.io.kr |
| prod  | `main` (FE 자동, BE 수동) | S3+CloudFront  | EC2 Docker     | flowmate.io.kr / api.flowmate.io.kr         |

### CI/CD (GitHub Actions, `.github/workflows/`)

- **FE dev/prod**: pnpm build → S3 sync → CloudFront invalidation
- **BE dev**: Dockerfile → ECR push (SHA 태그) → SSH → docker compose up
- **BE prod**: push 시 ECR push (SHA+latest 태그), 수동 dispatch 시 version 태그 → SSH → docker compose up
- 프로덕션 BE 배포는 `workflow_dispatch`로 version 입력 필요 (안전장치)

### Docker Compose (`infra/{dev,prod}/`)

3개 서비스: `mysql` (8.0) + `backend` (ECR 이미지) + `alloy` (Grafana Alloy v1.8.3)

- Nginx: 호스트에서 직접 실행 (컨테이너 아닌), Let's Encrypt TLS, `/actuator` 차단 (health만 허용)
- Alloy: Prometheus scrape (백엔드+호스트) → Mimir, Docker logs → Loki, OTLP → Tempo

### Flyway 마이그레이션 (`backend/src/main/resources/db/migration/`)

- V1: todos, todo_sessions, user_settings, reviews
- V2: users, auth_social_accounts, auth_refresh_tokens (token_hash UNIQUE 포함)
- V3: timer_states (JSON blob + version + soft delete)
- V4: todos에 review_round, original_todo_id 추가

## Git 워크플로우 & 릴리즈

### 브랜치 전략

- `develop`: 활성 개발 브랜치, 직접 커밋 또는 feature 브랜치 → develop 머지. amend + force push 허용
- `main`: 프로덕션, develop → main **squash merge**로 릴리즈 단위 깔끔한 히스토리 유지
- hotfix: main에서 수정 후 `merge main into develop`로 역동기화

### main 반영 절차 (squash merge)

```bash
git checkout main
git merge develop --squash
git commit -m "feat: v1.x.0 — 릴리즈 요약"
git push origin main
```

- develop의 세부 커밋 히스토리는 develop에만 보존
- main은 릴리즈 단위로 1커밋 = 1버전
- `git reset --hard develop` 방식은 사용하지 않음 (develop 히스토리가 main에 그대로 복사되므로)

### 릴리즈 이력 (최신순)

| 버전     | 날짜         | 주요 내용                        |
|--------|------------|------------------------------|
| v1.6.0 | 2026-03-23 | 복습 일정 기능 (review_round 체인)   |
| v1.5.1 | 2026-03-06 | 뽀모도로 경계 기록 보정 + 완료 후 타이머 초기화 |
| v1.5.0 | 2026-03-04 | 날짜 이동 + 또 하기 기능              |
| v1.4.x | 2026-03-03 | 타이머 배경음악 (Lo-fi 자동 순환)       |
| v1.3.0 | 2026-03-03 | 타이머 동기화 + SSE 안정화            |
| v1.2.0 | 2026-03-01 | 인증 강화 + 계획 페이지 개선            |
| v1.1.x | 2026-02-27 | JWT/OAuth 인증 전환 + 프로덕션 안정화   |
| v1.0.0 | 2026-02-22 | 최초 릴리즈                       |

## 문서 구조

### 정식 문서 (Source of Truth)

- `docs/architecture.md` — AWS 인프라, 인증 흐름, SSE 아키텍처, 배포 파이프라인
- `docs/api.md` — 전체 API 계약 (엔드포인트, 요청/응답 스키마, 에러 코드)
- `docs/data-model.md` — 개념·논리·물리 데이터 모델 + 설계 근거

### 참고 문서 (agent/ — gitignored, 로컬 참고용)

- `agent/guide/concepts/` — 백엔드(10편), 프론트엔드(1편), 인프라(9편) 학습 가이드
- `agent/guide/patterns/` — dirty checking, OSIV, N+1, Flyway, 예외처리, 멱등성 등 10개 패턴
- `agent/guide/hands-on/` — 인증 코드 가이드, 타이머 데드락, 부하 테스트 실습 6편
- `agent/log/decisions/` — 12개 아키텍처 의사결정 기록
- `agent/log/troubleshooting/` — SSE 타임아웃, 타이머 데드락, CloudFront 403 등 7개 트러블슈팅 로그
- `agent/plan/` — 기능별 구현 플랜, 로드맵

### 부하 테스트 (`agent/load-test/v1/`)

- k6 baseline 스크립트: 3개 시나리오 (browseRead 50%, todoWorkflow 35%, profileAndReview 15%)
- smoke (3 VU, 1분) / baseline (12 VU peak, 10분) 프로필
- 토큰 풀 생성 스크립트 + Grafana Cloud 메트릭 전송
- 실행 가이드 7편 + 리포트 템플릿

## 코딩 컨벤션

- 2스페이스 들여쓰기, 싱글 쿼트, 세미콜론 없음 (프론트엔드)
- 컴포넌트: PascalCase, 훅: `useX`, 유틸: camelCase
- 테스트 파일은 소스 옆에 `*.test.ts(x)` — Vitest + Testing Library + MSW
- 백엔드 테스트: JUnit 5 + Mockito + AssertJ, 서비스 레이어 단위 테스트 중심
- `docs/`가 정식 문서, `agent/`는 로컬 참고용 (gitignored). README는 포트폴리오용
- DB 스키마 변경은 반드시 Flyway 마이그레이션 (`V{N}__description.sql`)
- 프로필: `local` (개발), `dev` (개발 서버), `prod` (운영) — 환경변수로 DB/CORS/쿠키보안 분리
- 디자인 시스템: `.impeccable.md` 참고 — Pretendard 폰트, emerald(#10b981) 주색상, 4px 그리드, 모바일 퍼스트 (max 512px)

## Source of Truth 우선순위

소스 코드 > README.md > `docs/` 정식 문서 > `agent/` 참고 문서
