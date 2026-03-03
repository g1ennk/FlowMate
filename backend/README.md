# Backend

> 상태: current
> 역할: FlowMate 백엔드 실행/구조 가이드. API/데이터 계약 정본은 `../docs/plan/api.md`, `../docs/plan/data.md`다.

## 개요

FlowMate 백엔드는 Spring Boot 4.0.2 + Java 21 기반 REST API 서버다.  
Todo, Timer, Session, Settings, Review와 JWT 기반 인증(게스트/회원)을 제공한다.

## 기술 스택

- Spring Boot 4.0.2
- Java 21
- Spring Web
- Spring Data JPA
- Spring Security
- Flyway
- MySQL 8.x
- Micrometer Actuator + Prometheus registry

## 빠른 시작

### 요구사항

- Java 21
- MySQL 8.x

### 실행

```bash
# 테스트
./gradlew test

# local 프로파일 실행
./gradlew bootRun --args='--spring.profiles.active=local'
```

헬스 체크:

```bash
curl http://localhost:8080/actuator/health
```

## 환경 변수

프로젝트는 `.env.local`을 자동 로딩하지 않는다.  
아래 값은 셸 export, IDE run configuration, direnv 같은 방식으로 주입해야 한다.

### Local 최소값

```bash
DB_USERNAME=flowmate
DB_PASSWORD=flowmate

# 64자리 HEX 문자열 (32바이트)
JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# 로컬에서 OAuth를 실제로 쓰지 않더라도 placeholder 필요
KAKAO_CLIENT_ID=dummy
KAKAO_CLIENT_SECRET=dummy
KAKAO_REDIRECT_URI=http://localhost:5173/auth/callback

COOKIE_SECURE=false
```

### Dev 주요값

```bash
DB_HOST=localhost
DB_PORT=3306
DB_NAME=flowmate
DB_USERNAME=flowmate
DB_PASSWORD=flowmate
JWT_SECRET=<64-char-hex>
KAKAO_CLIENT_ID=<value>
KAKAO_CLIENT_SECRET=<value>
KAKAO_REDIRECT_URI=https://dev.flowmate.io.kr/auth/callback
CORS_ORIGINS=http://localhost:5173,https://dev.flowmate.io.kr
COOKIE_SECURE=true
```

### Prod 주요값

```bash
DB_HOST=<db-host>
DB_PORT=3306
DB_NAME=<db-name>
DB_USERNAME=<db-user>
DB_PASSWORD=<db-password>
JWT_SECRET=<64-char-hex>
KAKAO_CLIENT_ID=<value>
KAKAO_CLIENT_SECRET=<value>
KAKAO_REDIRECT_URI=https://flowmate.io.kr/auth/callback
CORS_ORIGINS=https://flowmate.io.kr,https://www.flowmate.io.kr
COOKIE_SECURE=true
```

## 프로파일

### local

- 파일: `src/main/resources/application-local.yml`
- DB: `localhost:3306/flowmate`
- 로그: `kr.io.flowmate=debug`
- Actuator 노출: `health`

### dev

- 파일: `src/main/resources/application-dev.yml`
- DB/CORS/env: 환경 변수 기반
- Actuator 노출: `health,info,prometheus,metrics`
- 커넥션 풀 최대 10

### prod

- 파일: `src/main/resources/application-prod.yml`
- DB/CORS/env: 환경 변수 필수
- Actuator 노출: `health,prometheus,metrics`
- 커넥션 풀 최대 20

## 패키지 구조

```txt
kr.io.flowmate
├── auth/         # JWT, OAuth, user/refresh token
├── common/       # 공통 DTO, 에러, resolver
├── config/       # security, cors, app config
├── review/       # 회고 도메인
├── session/      # 세션 도메인
├── settings/     # 사용자 설정 도메인
├── timer/        # 타이머 상태 저장/SSE 동기화
└── todo/         # todo 도메인
```

## 인증 모델

### 게스트

- `POST /api/auth/guest/token`
- 응답의 `guestToken`을 `Authorization: Bearer {guestToken}`으로 사용
- JWT `sub`는 clientId UUID, `role=guest`

### 회원

- `GET /api/auth/kakao/authorize-url`
- `POST /api/auth/kakao/exchange`
- 응답 body의 `accessToken`은 Bearer 토큰으로 사용
- `refreshToken`은 HttpOnly 쿠키로 발급

### 세션 복원/로그아웃

- `POST /api/auth/refresh`
  - 쿠키 기반 access token 재발급
- `POST /api/auth/logout`
  - refresh token revoke + 쿠키 삭제
- `GET /api/auth/me`
  - 회원 전용, guest JWT는 접근 불가
- `GET /api/timer/sse?token={accessToken}`
  - Security에서는 `permitAll()`이지만 컨트롤러에서 query token 검증 + member role 검증 수행

## 핵심 규칙

### 인증

- 인증 API와 `/actuator/**` 외의 모든 API는 인증 필요
- 인증 헤더는 `Authorization: Bearer {guestJWT|accessJWT}`
- 현재 사용자 식별은 `CurrentUserResolver`가 SecurityContext의 principal에서 읽는다
- `/api/timer/state/**`는 `ROLE_MEMBER` 전용이다
- `/api/timer/sse`는 `Authorization` 헤더 대신 query param `token`을 받아 member access token을 직접 검증한다

### 에러 응답 포맷

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "validation failed",
    "fields": {
      "title": "title must be at most 200 characters"
    }
  }
}
```

### 타이머/세션 정책

- 회원 타이머 진행 상태는 `timer_states`와 SSE로 서버 동기화한다
- 게스트 타이머 진행 상태는 클라이언트 메모리 상태로만 유지한다
- `/api/timer/sse` 스트림은 `connected`, `heartbeat`, `timer-state` 이벤트를 순서대로 사용한다
  - `connected`: 연결 직후 1회
  - `heartbeat`: 약 25초 간격 keepalive
  - `timer-state`: 실제 상태 변경 브로드캐스트
- `application-local/dev/prod.yml`은 SSE 장기 연결을 위해 `spring.mvc.async.request-timeout: 1h`를 사용한다
- 완료 세션은 `todo_sessions`에 저장한다
- 집계 정본은 `todo.sessionCount`, `todo.sessionFocusSeconds`
- 세션 생성은 `clientSessionId` 기반 멱등 처리

## API 엔드포인트

### Auth

- `POST /api/auth/guest/token`
- `GET /api/auth/{provider}/authorize-url`
- `POST /api/auth/{provider}/exchange`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Todo

- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/{id}`
- `DELETE /api/todos/{id}`
- `PUT /api/todos/reorder`

### Session

- `GET /api/todos/{todoId}/sessions`
- `POST /api/todos/{todoId}/sessions`

### Timer

- `GET /api/timer/sse?token={accessToken}`
- `PUT /api/timer/state/{todoId}`
- `GET /api/timer/state`

`GET /api/timer/sse?token={accessToken}` 세부 계약:

- member access token을 query param으로 전달
- 응답 타입: `text/event-stream`
- 이벤트:
  - `connected`
  - `heartbeat`
  - `timer-state`

### Settings

- `GET /api/settings`
- `PUT /api/settings/pomodoro-session`
- `PUT /api/settings/automation`
- `GET /api/settings/mini-days`
- `PUT /api/settings/mini-days`

### Review

- `GET /api/reviews?type=...&periodStart=...`
- `GET /api/reviews?type=...&from=...&to=...`
- `PUT /api/reviews`
- `DELETE /api/reviews/{id}`

## 테스트

```bash
./gradlew test
./gradlew test --tests '*Todo*'
./gradlew test --tests '*Session*'
./gradlew test --tests '*Settings*'
./gradlew test --tests '*Review*'
```

현재 저장소의 백엔드 테스트는 서비스 레이어 Mockito 테스트 4개가 중심이다.

- `src/test/java/kr/io/flowmate/todo/service/TodoServiceTest.java`
- `src/test/java/kr/io/flowmate/session/service/SessionServiceTest.java`
- `src/test/java/kr/io/flowmate/settings/service/SettingsServiceTest.java`
- `src/test/java/kr/io/flowmate/review/service/ReviewServiceTest.java`

## 데이터베이스

### Flyway

- 위치: `src/main/resources/db/migration/`
- 현재 마이그레이션
  - `V1__init.sql`
  - `V2__add_auth.sql`
  - `V3__add_timer_state.sql`

### 주요 테이블

- `users`
- `auth_social_accounts`
- `auth_refresh_tokens`
- `todos`
- `timer_states`
- `todo_sessions`
- `user_settings`
- `reviews`

## 핵심 로직

### Session 생성 멱등성

- 키: `(todo_id, client_session_id)`
- 신규 생성: `201 Created`
- 동일 요청 재전송: `200 OK`
- `sessionFocusSeconds`가 다르면 `400`
- `breakSeconds`는 증가 방향으로만 보정

### Todo Reorder

- 프론트가 계산한 `miniDay`, `dayOrder`를 그대로 저장
- 응답은 전체 Todo 목록 기준으로 재정렬해 반환

### Settings 기본값

- DB 레코드가 없으면 기본값 반환
- 최초 변경 시 `getOrCreate`로 영속 저장
- DB DEFAULT + 서비스 기본값 + 프론트 placeholder의 3중 보장

## 관련 문서

- [API 계약](../docs/plan/api.md)
- [데이터 모델](../docs/plan/data.md)
- [인프라 가이드](../infra/README.md)
- [인증 구현 참고](../docs/agent/plan/oauth-plan.md)
