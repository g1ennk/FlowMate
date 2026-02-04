# FlowMate Data Model

## 1) Conceptual Model (개념적 모델)

### 핵심 개념

- **User(게스트)**: 로그인 전 MVP는 `X-Client-Id`를 userId로 사용
- **Todo**: 날짜 기반 할 일 + 타이머 누적
- **Session (MVP)**: 완료된 집중/휴식 기록(서버 저장 대상)
- **Review (MVP)**: 기간별 회고 (일일/주간/월간/연간)
- **Settings**: 사용자 단위 환경설정(세션/자동화/미니데이)

### 관계

- User 1 : N Todo
- User 1 : 1 Settings
- Todo 1 : N Session
- User 1 : N Review

> Timer 상태는 **클라이언트 localStorage**에만 저장.
> Session은 **MVP에서 서버 저장** 대상으로 포함.

## 2) Logical Model (논리적 모델)

### Todo

- `id`
- `userId`
- `title`
- `note?`
- `date`
- `miniDay` (0~3)
- `dayOrder`
- `isDone`
- `sessionCount` (완료된 Flow 횟수)
- `sessionFocusSeconds`
- `timerMode` (`stopwatch` | `pomodoro` | null)
- `createdAt`, `updatedAt`

### Session

- `id`
- `todoId`
- `userId`
- `sessionFocusSeconds` (초)
- `breakSeconds` (초)
- `sessionOrder` (같은 `todoId` 내 생성 순번, 서버 저장/응답용)
- `createdAt`, `updatedAt`

> 클라이언트 localStorage의 `sessions`는 복원/통계 목적의 경량 구조(`sessionFocusSeconds`, `breakSeconds`)만 저장하며, `sessionOrder`는 서버 레코드에서 관리한다.

### Settings (UserSettings)

Pomodoro Session

- `flowMin`, `breakMin`, `longBreakMin`, `cycleEvery`

Automation

- `autoStartBreak`, `autoStartSession`

MiniDays

- `day1/2/3` 라벨 + 시간 범위
- Day 0은 **미분류 고정**

기본값/저장 정책

- 설정 기본값은 DB/서비스/클라이언트 3중으로 보장한다.
  - DB: `NOT NULL DEFAULT`로 무결성 보장
  - 서비스: 누락/구버전 데이터 정규화
  - 클라이언트: 초기 렌더 placeholder 용 기본값
- 설정 데이터가 아직 없는 사용자에 대해서는 GET 시 기본값을 반환하고, 최초 변경(UPDATE/UPSERT) 시 영속 저장한다.

### Review

- `id`
- `userId`
- `type` (`daily` | `weekly` | `monthly` | `yearly`)
- `periodStart` (YYYY-MM-DD)
- `periodEnd` (YYYY-MM-DD)
- `content` (텍스트)
- `createdAt`, `updatedAt`

## 3) Physical Model (물리적 모델, MySQL 기준)

### 3.1 todos

```sql
CREATE TABLE todos
(
    id                    VARCHAR(36) PRIMARY KEY,
    user_id               VARCHAR(255) NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    note                  TEXT,
    date                  DATE         NOT NULL,
    mini_day              TINYINT      NOT NULL DEFAULT 0, -- 0~3
    day_order             INT          NOT NULL DEFAULT 0,
    is_done               BOOLEAN      NOT NULL DEFAULT FALSE,
    session_count         INT          NOT NULL DEFAULT 0,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    timer_mode            VARCHAR(20),
    created_at            TIMESTAMP    NOT NULL,
    updated_at            TIMESTAMP    NOT NULL,
    INDEX                 idx_todos_user_date (user_id, date), -- 사용자/날짜 Todo 조회 핫패스
    INDEX                 idx_todos_user_dayorder (user_id, date, is_done, mini_day, day_order) -- 섹션/완료상태/정렬 조회
);
```

### 3.2 todo_sessions

```sql
CREATE TABLE todo_sessions
(
    id                    VARCHAR(36) PRIMARY KEY,
    todo_id               VARCHAR(36)  NOT NULL,
    user_id               VARCHAR(255) NOT NULL,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    break_seconds         INT          NOT NULL DEFAULT 0,
    session_order         INT          NOT NULL,
    created_at            TIMESTAMP    NOT NULL,
    updated_at            TIMESTAMP    NOT NULL,
    FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,
    INDEX                 idx_sessions_todo (todo_id), -- Todo별 세션 조회/삭제
    INDEX                 idx_sessions_user (user_id) -- 사용자 단위 분석/확장 대비
);
```

### 3.3 user_settings

```sql
CREATE TABLE user_settings
(
    user_id            VARCHAR(255) PRIMARY KEY,

    -- Pomodoro Session
    flow_min           INT         NOT NULL DEFAULT 25,
    break_min          INT         NOT NULL DEFAULT 5,
    long_break_min     INT         NOT NULL DEFAULT 15,
    cycle_every        INT         NOT NULL DEFAULT 4,

    -- Automation
    auto_start_break   BOOLEAN     NOT NULL DEFAULT FALSE,
    auto_start_session BOOLEAN     NOT NULL DEFAULT FALSE,

    -- MiniDays (분 단위 저장)
    day1_label         VARCHAR(50) NOT NULL DEFAULT '오전',
    day1_start_min     SMALLINT    NOT NULL DEFAULT 360,  -- 06:00
    day1_end_min       SMALLINT    NOT NULL DEFAULT 720,  -- 12:00

    day2_label         VARCHAR(50) NOT NULL DEFAULT '오후',
    day2_start_min     SMALLINT    NOT NULL DEFAULT 720,
    day2_end_min       SMALLINT    NOT NULL DEFAULT 1080, -- 18:00

    day3_label         VARCHAR(50) NOT NULL DEFAULT '저녁',
    day3_start_min     SMALLINT    NOT NULL DEFAULT 1080,
    day3_end_min       SMALLINT    NOT NULL DEFAULT 1440, -- 24:00

    updated_at         TIMESTAMP   NOT NULL
);
```

### 3.4 reviews

```sql
CREATE TABLE reviews
(
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(255) NOT NULL,
    type         VARCHAR(20)  NOT NULL, -- daily/weekly/monthly/yearly
    period_start DATE         NOT NULL,
    period_end   DATE         NOT NULL,
    content      TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL,
    updated_at   TIMESTAMP    NOT NULL,
    UNIQUE KEY uniq_reviews_user_period (user_id, type, period_start), -- 기간별 회고 1건 보장(upsert 충돌 키)
    INDEX        idx_reviews_user_period (user_id, period_start) -- 사용자/기간 범위 조회
);
```

> `uniq_reviews_user_period (user_id, type, period_start)`는 동일 사용자-동일 기간 타입-동일 시작일 조합의 중복 회고를 방지한다.
> 이 제약이 안정적으로 동작하려면 `period_start` 정규화가 필요하다.
> - daily: 해당 일자
> - weekly: 주 시작일(월요일)
> - monthly: 월 시작일(1일)

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

- `mini_day`: 0~3 고정
- `day_order`: 0 이상
- MiniDays: 각 구간은 start < end, 구간 간 공백 허용
- Session은 **MVP 포함** (클라이언트는 `sessions`를 초 단위로 로컬 보관 + 서버 저장)
- 설정 기본값은 DB/서비스/클라이언트에서 중복 보장하고, 서버를 최종 기준(source of truth)으로 사용
