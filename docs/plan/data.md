# FlowMate Data Model

## 1) Conceptual Model (개념적 모델)

### 핵심 개념

- **User(게스트)**: 로그인 전 MVP는 `X-Client-Id`를 userId로 사용
- **Todo**: 날짜 기반 할 일 + 타이머 누적
- **Session (MVP)**: 완료된 집중/휴식 기록(서버 저장 대상)
- **Review (MVP)**: 기간별 회고 (일일/주간/월간)
- **Settings**: 사용자 단위 환경설정(세션/자동화/미니데이)

### 관계

- User 1 : N Todo
- User 1 : 1 Settings
- Todo 1 : N Session
- User 1 : N Review

> Timer 상태는 **클라이언트 localStorage**에만 저장.
> 저장 키: `flowmate/{clientId}/timers` (payload에 `version`, `activeId`, `items` 포함)
> Session은 **MVP에서 서버 저장** 대상으로 포함.

## 2) Logical Model (논리적 모델)

### Todo

- `id`: string (UUID, 36자)
- `userId`: string (UUID, 36자)
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
- `sessionFocusSeconds`: int (초 단위, 0 이상)
- `breakSeconds`: int (초 단위, 0 이상)
- `sessionOrder`: int (같은 `todoId` 내 생성 순번, 중복 불가)
- `createdAt`, `updatedAt`: Instant

> 클라이언트 localStorage의 `sessions`는 복원/통계 목적의 경량 구조(`sessionFocusSeconds`, `breakSeconds`)만 저장하며, `sessionOrder`는 서버 레코드에서 관리한다.

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

- 설정 기본값은 DB/서비스/클라이언트 3중으로 보장한다.
  - DB: `NOT NULL DEFAULT`로 무결성 보장
  - 서비스: 누락/구버전 데이터 정규화
  - 클라이언트: 초기 렌더 placeholder 용 기본값
- 설정 데이터가 아직 없는 사용자에 대해서는 GET 시 기본값을 반환하고, 최초 변경(UPDATE/UPSERT) 시 영속 저장한다.

### Review

- `id`: string (UUID, 36자)
- `userId`: string (UUID, 36자)
- `type`: enum (`daily` | `weekly` | `monthly`)
- `periodStart`: LocalDate (YYYY-MM-DD, 정규화 필요)
- `periodEnd`: LocalDate (YYYY-MM-DD)
- `content`: string (텍스트)
- `createdAt`, `updatedAt`: Instant

## 3) Physical Model (물리적 모델, MySQL 기준)

### 3.1 todos

```sql
-- noinspection SqlNoDataSourceInspection,SqlResolve
CREATE TABLE todos
(
    id                    VARCHAR(36) PRIMARY KEY,
    user_id               VARCHAR(36)  NOT NULL,           -- X-Client-Id (UUID, 36자)
    title                 VARCHAR(200) NOT NULL,
    note                  TEXT,
    date                  DATE         NOT NULL,
    mini_day              INT          NOT NULL DEFAULT 0, -- 0~3 (0=미분류, 1~3=시간대)
    day_order             INT          NOT NULL DEFAULT 0,
    is_done               TINYINT(1)   NOT NULL DEFAULT 0, -- MySQL BOOLEAN = TINYINT(1)
    session_count         INT          NOT NULL DEFAULT 0,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    timer_mode            VARCHAR(20),                     -- 'stopwatch', 'pomodoro', null
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX                 idx_todos_user_order (user_id, date, mini_day, day_order, created_at) -- 목록 조회/정렬 공용 인덱스
);
```

### 3.2 todo_sessions

```sql
-- noinspection SqlNoDataSourceInspection,SqlResolve
CREATE TABLE todo_sessions
(
    id                    VARCHAR(36) PRIMARY KEY,
    todo_id               VARCHAR(36) NOT NULL,
    user_id               VARCHAR(36) NOT NULL,            -- X-Client-Id (UUID, 36자)
    session_focus_seconds INT         NOT NULL DEFAULT 0,
    break_seconds         INT         NOT NULL DEFAULT 0,
    session_order         INT         NOT NULL,
    created_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_todo_sessions_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,
    
    CONSTRAINT uq_todo_sessions_order
        UNIQUE (todo_id, session_order),                 -- 같은 todo_id 내 session_order 중복 불가
    
    -- idx_sessions_todo는 uq_todo_sessions_order (todo_id, session_order)가 
    -- todo_id 단독 조회도 커버하므로 생략 (복합 인덱스의 왼쪽 prefix 활용)
    INDEX idx_sessions_user (user_id)                    -- 사용자 단위 통계/분석용
);
```

### 3.3 user_settings

```sql
-- noinspection SqlNoDataSourceInspection,SqlResolve
CREATE TABLE user_settings
(
    user_id            VARCHAR(36) PRIMARY KEY,             -- X-Client-Id (UUID, 36자)

    -- Pomodoro Session
    flow_min           INT        NOT NULL DEFAULT 25,
    break_min          INT        NOT NULL DEFAULT 5,
    long_break_min     INT        NOT NULL DEFAULT 15,
    cycle_every        INT        NOT NULL DEFAULT 4,

    -- Automation
    auto_start_break   TINYINT(1) NOT NULL DEFAULT 0,      -- MySQL BOOLEAN = TINYINT(1)
    auto_start_session TINYINT(1) NOT NULL DEFAULT 0,

    -- MiniDays (분 단위 저장, 0~1440)
    day1_label         VARCHAR(50) NOT NULL DEFAULT '오전',
    day1_start_min     INT         NOT NULL DEFAULT 360,   -- 06:00
    day1_end_min       INT         NOT NULL DEFAULT 720,   -- 12:00

    day2_label         VARCHAR(50) NOT NULL DEFAULT '오후',
    day2_start_min     INT         NOT NULL DEFAULT 720,   -- 12:00
    day2_end_min       INT         NOT NULL DEFAULT 1080,  -- 18:00

    day3_label         VARCHAR(50) NOT NULL DEFAULT '저녁',
    day3_start_min     INT         NOT NULL DEFAULT 1080,  -- 18:00
    day3_end_min       INT         NOT NULL DEFAULT 1440,  -- 24:00

    updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### 3.4 reviews

```sql
-- noinspection SqlNoDataSourceInspection,SqlResolve
CREATE TABLE reviews
(
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL,                    -- X-Client-Id (UUID, 36자)
    type         VARCHAR(20) NOT NULL,                    -- 'daily', 'weekly', 'monthly'
    period_start DATE        NOT NULL,                    -- 정규화 필요 (아래 참고)
    period_end   DATE        NOT NULL,
    content      TEXT        NOT NULL,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT uniq_reviews_user_period 
        UNIQUE (user_id, type, period_start),            -- 기간별 회고 1건 보장 (upsert 충돌 키)
    INDEX idx_reviews_user_period (user_id, period_start) -- 사용자/기간 범위 조회
);
```

> `uniq_reviews_user_period (user_id, type, period_start)`는 동일 사용자-동일 기간 타입-동일 시작일 조합의 중복 회고를 방지한다.
> 이 제약이 안정적으로 동작하려면 `period_start` 정규화가 필요하다.
> - **daily**: 해당 일자
> - **weekly**: 주 시작일(월요일)
> - **monthly**: 월 시작일(1일)

### 3.5 Index 정책 (MVP)

- 전략: **핫패스 최소 인덱스 먼저 적용**, 이후 실측 기반으로 추가한다.
- 초기 포함 인덱스는 위 테이블의 조회/정렬 핵심 경로만 대상으로 한다.
- 후속 인덱스 추가 기준:
  - `EXPLAIN`에서 full scan/rows 과다 확인
  - p95/p99 응답 시간 악화
  - 읽기/쓰기 비용 트레이드오프 검토
- 성능 개선 이력은 "추가 전/후 쿼리 계획 + 응답 시간"으로 기록한다.

---

## 4) ERD (요약)

```
User (clientId)
   │ 1
   │
   ├── 1 ───── user_settings
   │
   └── N ───── todos ──── N todo_sessions
   └── N ───── reviews
```

---

## 5) 제약/정합성 규칙

### 기본 타입 제약
- `id`: UUID 형식 (36자)
- `user_id`: X-Client-Id (UUID, 36자)

### Todo 테이블
- `mini_day`: 0~3 고정 (0=미분류, 1~3=시간대 라벨)
- `day_order`: 0 이상 정수
- `session_count`: 0 이상 정수 (완료된 Flow 횟수)
- `session_focus_seconds`: 0 이상 정수 (초 단위)
- `title`: 1~200자 (NOT NULL)
- `timer_mode`: 'stopwatch', 'pomodoro', null만 허용

### Session 테이블
- `sessionOrder`: 같은 todo_id 내 중복 불가 (UNIQUE 제약)
- `session_focus_seconds`: 0 이상 정수 (초 단위)
- `break_seconds`: 0 이상 정수 (초 단위)

### Settings 테이블
- `flowMin`: 1~90 (기본값 25)
- `breakMin`: 1~90 (기본값 5)
- `longBreakMin`: 1~90 (기본값 15)
- `cycleEvery`: 1~10 (기본값 4)
- MiniDays 시간 범위: 0~1440분 (00:00~24:00)
- MiniDays 구간: 각 구간은 start < end, 구간 간 공백 허용 (연속 불필요)

### Reviews 테이블
- (user_id, type, period_start) 조합 중복 불가 (UNIQUE 제약)
- `type`: 'daily', 'weekly', 'monthly'만 허용
- `period_start` 정규화 규칙:
  - **daily**: 해당 일자 (YYYY-MM-DD)
  - **weekly**: 주 시작일 월요일 (ISO 8601)
  - **monthly**: 월 시작일 1일 (YYYY-MM-01)

### 기타 규칙
- Session은 **MVP 포함** (클라이언트는 `sessions`를 초 단위로 로컬 보관 + 서버 저장)
- 설정 기본값은 DB/서비스/클라이언트에서 중복 보장하고, 서버를 최종 기준(source of truth)으로 사용
- 모든 TIMESTAMP 필드는 DB DEFAULT로 자동 관리 (JPA @PrePersist/@PreUpdate는 백업용)
