# FlowMate Data Model

> 상태: current
> 역할: 현재 데이터 모델/스키마 정본

## 1) Conceptual Model (개념적 모델)

### 핵심 개념

- **User**: 게스트(guestJWT)와 회원(카카오 로그인) 모두 동일한 `user_id` 구조로 식별
- **Todo**: 날짜 기반 할 일 + 타이머 누적
- **TimerState**: 회원의 현재 활성 타이머 스냅샷 (`timer_states`, SSE/초기 복원용)
- **Session**: 완료된 집중/휴식 기록 (서버 저장)
- **Review**: 기간별 회고 (일일/주간/월간)
- **Settings**: 사용자 단위 환경설정 (세션/자동화/미니데이)

### 관계

- User 1 : N Todo
- User 1 : 1 Settings
- User 1 : N TimerState
- Todo 1 : N Session
- Todo 1 : 0..1 TimerState
- User 1 : N Review
- User 1 : N SocialAccount (소셜 로그인 연결)
- User 1 : N RefreshToken (발급된 Refresh Token)

> 회원 타이머 상태의 정본은 서버 `timer_states`다.
> 클라이언트는 서버에서 받은 스냅샷을 `hydrateState()`로 런타임 상태로 보정한다.
> 완료 세션의 정본은 여전히 `todo_sessions`다.

---

## 2) Logical Model (논리적 모델)

### User

- `id`: string (UUID, 36자) — 게스트는 JWT sub, 회원은 users 테이블 PK
- `email?`: string | null
- `nickname`: string
- `createdAt`, `updatedAt`: Instant

### SocialAccount

- `id`: string (UUID, 36자)
- `userId`: string (users.id FK)
- `provider`: string (`kakao`)
- `providerUserId`: string (카카오 회원번호)
- `createdAt`: Instant

### RefreshToken

- `id`: string (UUID, 36자)
- `userId`: string (users.id FK)
- `tokenHash`: string (SHA-256 해시, 평문 저장 금지)
- `expiresAt`: Instant
- `revokedAt?`: Instant | null
- `createdAt`: Instant

### Todo

- `id`: string (UUID, 36자)
- `userId`: string (UUID, 36자) — 게스트 clientId 또는 회원 userId
- `title`: string (1~200자)
- `note?`: string | null
- `date`: LocalDate (YYYY-MM-DD)
- `miniDay`: int (0~3, 0=미분류, 1~3=시간대)
- `dayOrder`: int (0 이상)
- `isDone`: boolean
- `sessionCount`: int (완료된 Flow 횟수, 0 이상)
- `sessionFocusSeconds`: int (초 단위, 0 이상)
- `timerMode`: enum (`stopwatch` | `pomodoro` | null)
- `createdAt`, `updatedAt`: Instant

### Session

- `id`: string (UUID, 36자)
- `todoId`: string (UUID, 36자)
- `userId`: string (UUID, 36자)
- `clientSessionId`: string (UUID, 36자, 멱등 키)
- `sessionFocusSeconds`: int (초 단위, 1 이상)
- `breakSeconds`: int (초 단위, 0 이상)
- `sessionOrder`: int (같은 todoId 내 생성 순번, 중복 불가)
- `createdAt`, `updatedAt`: Instant

### TimerState

- `todoId`: string (UUID, 36자, PK, todos.id FK)
- `userId`: string (UUID, 36자, 회원 userId)
- `stateJson?`: object | null (`null`이면 idle soft delete)
- `version`: long (단조 증가, 최신성 판단 정본)
- `createdAt`, `updatedAt`: Instant

### Settings (UserSettings)

Pomodoro Session
- `flowMin`: int (1~90, 기본값 25)
- `breakMin`: int (1~90, 기본값 5)
- `longBreakMin`: int (1~90, 기본값 15)
- `cycleEvery`: int (1~10, 기본값 4)

Automation
- `autoStartBreak`: boolean (기본값 false)
- `autoStartSession`: boolean (기본값 false)

MiniDays
- `day1/2/3`: 각각 라벨(string) + 시간 범위(int, 분 단위 0~1440)
- Day 0은 **미분류 고정**

기본값/저장 정책
- DB `NOT NULL DEFAULT` → 서비스 `getOrDefault` → 클라이언트 placeholder 3중 보장
- 최초 변경 시 영속 저장 (`getOrCreate`)

### Review

- `id`: string (UUID, 36자)
- `userId`: string (UUID, 36자)
- `type`: enum (`daily` | `weekly` | `monthly`)
- `periodStart`: LocalDate
- `periodEnd`: LocalDate
- `content`: string
- `createdAt`, `updatedAt`: Instant

---

## 3) Physical Model (물리적 모델, MySQL 기준)

### 3.1 users *(신규)*

```sql
CREATE TABLE users (
    id         VARCHAR(36)  PRIMARY KEY,
    email      VARCHAR(255),
    nickname   VARCHAR(100),
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3.2 auth_social_accounts *(신규)*

```sql
CREATE TABLE auth_social_accounts (
    id               VARCHAR(36)  PRIMARY KEY,
    user_id          VARCHAR(36)  NOT NULL,
    provider         VARCHAR(20)  NOT NULL DEFAULT 'kakao',
    provider_user_id VARCHAR(100) NOT NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_social_user   FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_provider_user UNIQUE (provider, provider_user_id)
);
```

### 3.3 auth_refresh_tokens *(신규)*

```sql
CREATE TABLE auth_refresh_tokens (
    id         VARCHAR(36)  PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP    NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_token_hash (token_hash)
);
```

### 3.4 todos *(변경 없음)*

```sql
CREATE TABLE todos (
    id                    VARCHAR(36)  PRIMARY KEY,
    user_id               VARCHAR(36)  NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    note                  TEXT,
    date                  DATE         NOT NULL,
    mini_day              INT          NOT NULL DEFAULT 0,
    day_order             INT          NOT NULL DEFAULT 0,
    is_done               TINYINT(1)   NOT NULL DEFAULT 0,
    session_count         INT          NOT NULL DEFAULT 0,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    timer_mode            VARCHAR(20),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_todos_user_order (user_id, date, mini_day, day_order, created_at)
);
```

> `user_id`는 게스트면 guestJWT의 `sub`(clientId UUID), 회원이면 `users.id`(userId UUID)가 들어간다.
> 컬럼 타입이 동일한 VARCHAR(36)이라 마이그레이션 불필요.

### 3.5 todo_sessions *(변경 없음)*

```sql
CREATE TABLE todo_sessions (
    id                    VARCHAR(36) PRIMARY KEY,
    todo_id               VARCHAR(36) NOT NULL,
    user_id               VARCHAR(36) NOT NULL,
    client_session_id     VARCHAR(36) NOT NULL,
    session_focus_seconds INT         NOT NULL DEFAULT 0,
    break_seconds         INT         NOT NULL DEFAULT 0,
    session_order         INT         NOT NULL,
    created_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_todo_sessions_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,
    CONSTRAINT uq_todo_sessions_order
        UNIQUE (todo_id, session_order),
    CONSTRAINT uq_todo_sessions_client_session
        UNIQUE (todo_id, client_session_id),

    INDEX idx_sessions_user (user_id)
);
```

### 3.6 timer_states *(신규)*

```sql
CREATE TABLE timer_states
(
    todo_id    VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    state_json TEXT         NULL,
    version    BIGINT       NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT fk_timer_states_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
);

CREATE INDEX idx_timer_states_user ON timer_states (user_id, updated_at DESC);
```

> `state_json = NULL`은 row 삭제가 아니라 idle 상태를 나타내는 soft delete다.
> 최신성 판단은 `updated_at`이 아니라 `version`으로 한다.

### 3.7 user_settings *(변경 없음)*

```sql
CREATE TABLE user_settings (
    user_id            VARCHAR(36)  PRIMARY KEY,

    flow_min           INT          NOT NULL DEFAULT 25,
    break_min          INT          NOT NULL DEFAULT 5,
    long_break_min     INT          NOT NULL DEFAULT 15,
    cycle_every        INT          NOT NULL DEFAULT 4,

    auto_start_break   TINYINT(1)   NOT NULL DEFAULT 0,
    auto_start_session TINYINT(1)   NOT NULL DEFAULT 0,

    day1_label         VARCHAR(50)  NOT NULL DEFAULT '오전',
    day1_start_min     INT          NOT NULL DEFAULT 360,
    day1_end_min       INT          NOT NULL DEFAULT 720,

    day2_label         VARCHAR(50)  NOT NULL DEFAULT '오후',
    day2_start_min     INT          NOT NULL DEFAULT 720,
    day2_end_min       INT          NOT NULL DEFAULT 1080,

    day3_label         VARCHAR(50)  NOT NULL DEFAULT '저녁',
    day3_start_min     INT          NOT NULL DEFAULT 1080,
    day3_end_min       INT          NOT NULL DEFAULT 1440,

    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3.8 reviews *(변경 없음)*

```sql
CREATE TABLE reviews (
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL,
    type         VARCHAR(20) NOT NULL,
    period_start DATE        NOT NULL,
    period_end   DATE        NOT NULL,
    content      TEXT        NOT NULL,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uniq_reviews_user_period
        UNIQUE (user_id, type, period_start),
    INDEX idx_reviews_user_period (user_id, period_start)
);
```

### 3.9 마이그레이션 파일

```
V1__init.sql     기존 (todos, todo_sessions, user_settings, reviews)
V2__add_auth.sql 신규 (users, auth_social_accounts, auth_refresh_tokens)
V3__add_timer_state.sql 신규 (timer_states)
```

### 3.10 Index 정책

- 전략: 핫패스 최소 인덱스 먼저, 이후 실측 기반으로 추가
- 후속 인덱스 추가 기준: `EXPLAIN` full scan 확인, p95/p99 응답 시간 악화, 읽기/쓰기 비용 트레이드오프 검토

---

## 4) ERD (요약)

```
users
  │ 1
  ├── N ── auth_social_accounts
  ├── N ── auth_refresh_tokens
  ├── 1 ── user_settings
  ├── N ── timer_states
  ├── N ── todos ── N ── todo_sessions
  │              └── 1 ── timer_states
  └── N ── reviews
```

> 게스트 데이터(todos, sessions, settings, reviews)의 `user_id`는 users 테이블에 존재하지 않는 UUID다.
> 게스트가 로그인하면 새 출발 (병합 없음). 게스트 데이터는 고아 데이터로 남아 배치 정리 대상이 된다.

---

## 5) 제약/정합성 규칙

### 공통
- `id`: UUID 형식 (36자)
- `user_id`: 게스트 clientId(UUID) 또는 회원 userId(UUID), 동일 VARCHAR(36) 구조

### Todo
- `mini_day`: 0~3 고정
- `day_order`: 0 이상 정수
- `session_count`: 0 이상 정수
- `session_focus_seconds`: 0 이상 정수 (초 단위)
- `title`: 1~200자 (NOT NULL)
- `timer_mode`: 'stopwatch', 'pomodoro', null만 허용

### Session
- `session_order`: 같은 todo_id 내 중복 불가 (UNIQUE)
- `client_session_id`: 같은 todo_id 내 중복 불가 (UNIQUE, 멱등 키)
- `session_focus_seconds`: API 입력 1 이상, DB 컬럼 0 이상
- `break_seconds`: 0 이상 (초 단위)
- 멱등 재요청 시 `break_seconds`는 감소 없이 증가 방향(`max`)으로만 갱신

### TimerState
- `todo_id`: PK이자 FK, Todo당 현재 스냅샷 row는 최대 1개
- `user_id`: member userId 저장, 게스트 타이머는 서버 저장 대상이 아님
- `state_json`: active 상태면 JSON blob, idle이면 `NULL`
- `version`: `max(now, lastVersion + 1)` 규칙으로 단조 증가
- `updated_at`: TTL cleanup 기준으로만 사용, 최신성 비교 기준은 아님

### Settings
- `flowMin`: 1~90 (기본값 25)
- `breakMin`: 1~90 (기본값 5)
- `longBreakMin`: 1~90 (기본값 15)
- `cycleEvery`: 1~10 (기본값 4)
- MiniDays 시간 범위: 0~1440분, 각 구간 start < end, 구간 간 공백 허용

### Reviews
- (user_id, type, period_start) 조합 중복 불가 (UNIQUE)
- `type`: 'daily', 'weekly', 'monthly'만 허용
- `period_start` 유효성:
  - **daily**: 임의 일자
  - **weekly**: 월요일만
  - **monthly**: 매월 1일만

### auth_refresh_tokens
- `token_hash`: SHA-256 해시 저장 (평문 저장 금지)
- 유효 조건: `revoked_at IS NULL AND expires_at > NOW()`
- 로그아웃 시 `revoked_at` 설정 (물리 삭제 아님)
