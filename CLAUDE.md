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
- **Backend**: Spring Boot 4.0.5 + Java 21 + MySQL 8 + Flyway
- **AI Service**: NestJS + Gemini API + PostgreSQL 16 — KPT 회고 레포트 생성 (`/api/ai`)
- **인증**: 게스트 JWT(localStorage, 90일) → 카카오 OAuth → 멤버 JWT(메모리만, 15분) + HttpOnly refresh cookie(14일, RTR)
- **실시간 동기화**: SSE로 타이머 상태 멀티디바이스 동기화 (쿼리파라미터 토큰, EventSource 제약)
- **배포**: EC2 + Docker Compose (백엔드+MySQL+AI서비스+PostgreSQL+Alloy), S3 + CloudFront (프론트엔드)
- **모니터링**: Grafana Cloud (Prometheus→Mimir, Docker logs→Loki, OTLP→Tempo) + Alloy 수집기

### Backend 도메인 패키지 (`kr.io.flowmate`)

| 패키지        | 역할                                                                                                    |
|------------|-------------------------------------------------------------------------------------------------------|
| `auth`     | JWT 발급/검증, 카카오 OAuth (Strategy 패턴: `OAuthProvider` → `OAuthProviderRegistry`), Refresh Token Rotation |
| `todo`     | Todo CRUD                                                                                             |
| `timer`    | 타이머 상태 push/pull + SSE broadcast (`SseEmitterRegistry`), state_json=null 소프트삭제, version 단조증가          |
| `session`  | 포모도로/스톱워치 세션 기록 (client_session_id로 멱등성, break_seconds는 증가만 허용)                                       |
| `review`   | 주간/월간 회고 (ReviewType enum, user_id+type+period_start unique)                                          |
| `settings` | 포모도로 설정(flow/break/longBreak/cycle), 미니데이 구간 3개, 자동화 플래그                                              |
| `common`   | `GlobalExceptionHandler`, `@CurrentUser` + `CurrentUserArgumentResolver`, `ListResponse`, `ApiError` (Record) |
| `config`   | `SecurityConfig` (`/actuator/**` 앱 레벨 허용, Nginx에서 health만 외부 노출, JSON 401/403), `JwtAuthFilter` (단일 파싱), `CorsConfig`, `WebMvcConfig` |

패턴: Lombok `@RequiredArgsConstructor`, Entity에 `create()` static factory, `@PostConstruct`로 SecretKey 캐싱, `@CurrentUser` 어노테이션으로 userId 주입, `AuthenticationFailedException` → 401 매핑
DTO 전략: Response DTO = Record (불변), Request DTO = Lombok `@Getter @Setter` (Jackson setter 바인딩 + `@Valid` 호환). 예외: `ExchangeRequest`는 Record (필드 2개, setter 불필요)

### Frontend 구조 (`frontend/src/`)

- **`features/`**: 도메인별 슬라이스 (auth, todos, timer, review, settings, system, pwa) — 페이지·컴포넌트·훅·헬퍼 자체 포함
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

| 환경    | 트리거                                          | 프론트엔드          | 백엔드            | 도메인                                         |
|-------|----------------------------------------------|----------------|----------------|---------------------------------------------|
| local | -                                            | localhost:5173 | localhost:8080 | -                                           |
| dev   | `main` push (자동, BE/FE/AI service 동시)         | S3+CloudFront  | EC2 Docker     | dev.flowmate.io.kr / api.dev.flowmate.io.kr |
| prod  | tag `v*.*.*` push (자동, BE/FE/AI service 동시)   | S3+CloudFront  | EC2 Docker     | flowmate.io.kr / api.flowmate.io.kr         |

### CI/CD (GitHub Actions, `.github/workflows/`)

- **Dev (BE/FE/AI service)**: `main` push 시 자동. BE/AI service는 ECR push (`github.sha` 태그) → SSH `git reset --hard origin/main` → `docker compose up`. FE는 pnpm build → S3 sync → CloudFront invalidation.
- **Prod (BE/FE/AI service)**: tag `v*.*.*` push 시 자동. BE는 ECR push (tag + latest), AI service는 ECR push (tag만) → SSH `git fetch --all --tags && git reset --hard ${tag}` → `docker compose pull + up`. FE는 pnpm build → S3 sync → CloudFront invalidation.
- **glob 가드** `v*.*.*`로 `archive/*` / `pre-release/*` / `hotfix/*` 등 비-semver tag는 prod 트리거 안 됨.
- **롤백**: prod 자동 dispatch는 제거됨. 이전 tag로 재배포가 필요하면 후속 작업으로 신설할 `redeploy-prod-*` 워크플로(`workflow_dispatch(tag)` input)를 사용하거나 새 패치 tag(예: v1.10.2)로 재배포.

### Docker Compose (`infra/{dev,prod}/`)

prod 5개 서비스: `mysql` (8.0) + `backend` (ECR 이미지) + `postgres` (16, AI service용) + `ai-service` (NestJS + Gemini) + `alloy` (Grafana Alloy v1.8.3)
dev 3개 서비스: `mysql` + `backend` + `alloy`

- Nginx: 호스트에서 직접 실행 (컨테이너 아닌), Let's Encrypt TLS, `/actuator` 차단 (health만 허용)
- Alloy: Prometheus scrape (백엔드+호스트) → Mimir, Docker logs → Loki, OTLP → Tempo

### Flyway 마이그레이션 (`backend/src/main/resources/db/migration/`)

- V1: todos, todo_sessions, user_settings, reviews
- V2: users, auth_social_accounts, auth_refresh_tokens (token_hash UNIQUE 포함)
- V3: timer_states (JSON blob + version + soft delete)
- V4: todos에 review_round, original_todo_id 추가 (복습 스케줄 기능 제거 후 컬럼은 미사용 상태로 보존, 차기 contract 릴리즈에서 DROP 예정)
- V5: user_settings에 created_at 추가, ON UPDATE CURRENT_TIMESTAMP 제거 (JPA Auditing 정합)

## Git 워크플로우 & 릴리즈

### 브랜치 전략 (v1.10~ 모델)

- `main`: 단일 활성 브랜치, SSoT, always-deployable. dev 환경의 진실이자 prod tag의 후보.
- `feature/<name>`: 큰 작업/실험 격리용. 짧게 살고 머지 후 브랜치 삭제. 자세한 commit은 main의 `--no-ff` merge commit 아래에 보존 (GitHub Network 그래프로 확인 가능).
- 작은 변경(1~3 commit)은 main 직접 commit 허용 — 단 항상 deployable 상태 유지 원칙 준수 (반쪽 commit 금지).
- 머지는 `--no-ff` merge commit (분기 그래프 보존).

### 일상 작업

```bash
# 작은 변경
git checkout main && git pull
git commit -m "feat: ..."
git push origin main                      # → dev 자동 배포

# 큰 작업
git checkout -b feat/redis
# ... 작업 ...
git checkout main && git pull
git merge --no-ff feat/redis
git push origin main                      # → dev 자동 배포
git branch -d feat/redis && git push origin --delete feat/redis
```

### 릴리즈

```bash
git tag -a v1.10.0 -m "v1.10.0 — Redis 토큰 캐시"
git push origin v1.10.0                   # → prod BE+FE+AI service 동시 자동 배포

gh release create v1.10.0 \
  --title "v1.10.0 — Redis 토큰 캐시" \
  --notes-file .github/releases/v1.10.0.md
```

- tag glob 가드: `v*.*.*` 형식만 prod 트리거.
- GitHub Releases가 포트폴리오 메인 view — 풍부한 release notes 작성.

### Hotfix

```bash
# 평시 (main이 deployable)
git commit -m "fix(timer): ..."
git push origin main                      # → dev 자동 검증
git tag v1.10.1 && git push origin v1.10.1

# 예외 — main에 WIP 누적된 상태
git checkout -b hotfix/v1.10.1 v1.10.0    # 마지막 tag에서 분기
# fix commit
git checkout main && git pull
git merge --no-ff hotfix/v1.10.1
git push origin main                      # → dev 검증
git tag v1.10.1 && git push origin v1.10.1
git branch -d hotfix/v1.10.1 && git push origin --delete hotfix/v1.10.1
```

### 릴리즈 모델 변천 이력

1. **~v1.7**: `develop reset --hard main + force push` (2026-04-25 폐기)
   - 폐기 이유: develop 작업 history 손실 → "develop은 자세하게 사용한다" 의도와 어긋남
2. **v1.8 ~ v1.9**: squash + backmerge (2026-05-14 폐기)
   - 폐기 이유: 1인 운영 부담 + backmerge 누락 사고 + 환경 토폴로지 분리 필요
3. **v1.10~**: main 단일 + tag 기반 (현재)
   - GitHub Flow 변형, dev = main HEAD, prod = tag

### 릴리즈 이력 (최신순)

| 버전     | 날짜         | 주요 내용                             |
|--------|------------|-----------------------------------|
| v1.10.0 | 2026-05-14 | trunk-based 브랜치 전략 + 운영 안정성·보안·CI 게이트 (인프라 릴리즈, API/DB 변경 0건) |
| v1.8.2 | 2026-04-28 | 회고 단건 조회 미존재 시 404→204 (콘솔 노이즈 제거) |
| v1.8.1 | 2026-04-28 | Gemini 503 에러 처리 + 릴리즈 절차 정비      |
| v1.8.0 | 2026-04-25 | 백엔드 도메인 11종 정합 + API 계약 정리        |
| v1.7.4 | 2026-04-09 | cold load 빈 화면 제거                 |
| v1.7.3 | 2026-04-08 | 회고 텍스트에어리어 데스크탑 스크롤 개선            |
| v1.7.2 | 2026-04-08 | 배포 직후 청크 로드 실패 복구                 |
| v1.7.0 | 2026-04-06 | AI KPT 회고 레포트 (NestJS + Gemini)   |
| v1.6.0 | 2026-03-23 | 복습 일정 기능 (review_round 체인)        |
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

### Superpowers 산출물 (.superpowers/ — gitignored, 로컬 참고용)

- brainstorm, plan, critique 등 superpowers 스킬이 생성하는 산출물은 `.superpowers/`에 저장
- `docs/` 루트의 정식 문서(architecture.md, api.md, data-model.md)에 저장하지 않음

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
- 커밋 Co-Authored-By: FE 관련 커밋(scope `frontend` 또는 내용이 FE 중심)에만 `Co-Authored-By: Claude <noreply@anthropic.com>` 추가. BE/infra/ai-service/docs/ci 커밋에는 붙이지 않음

## Source of Truth 우선순위

소스 코드 > README.md > `docs/` 정식 문서 > `agent/` 참고 문서
