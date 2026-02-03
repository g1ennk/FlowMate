# FlowMate Data Model

## 1) Conceptual Model (개념적 모델)

### 핵심 개념

- **User(게스트)**: 로그인 전 MVP는 `X-Client-Id`를 userId로 사용
- **Todo**: 날짜 기반 할 일 + 타이머 누적
- **Session (MVP)**: 완료된 집중/휴식 기록(서버 저장 대상)
- **Settings**: 사용자 단위 환경설정(세션/자동화/미니데이)

### 관계

- User 1 : N Todo
- User 1 : 1 Settings
- Todo 1 : N Session

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
- `sessionOrder`
- `createdAt`, `updatedAt`

### Settings (UserSettings)

Pomodoro Session

- `flowMin`, `breakMin`, `longBreakMin`, `cycleEvery`

Automation

- `autoStartBreak`, `autoStartSession`

MiniDays

- `day1/2/3` 라벨 + 시간 범위
- Day 0은 **미분류 고정**

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
    INDEX                 idx_todos_user_date (user_id, date),
    INDEX                 idx_todos_user_dayorder (user_id, date, is_done, mini_day, day_order)
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
    INDEX                 idx_sessions_todo (todo_id),
    INDEX                 idx_sessions_user (user_id)
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

---

## 4) ERD (요약)

```
User (clientId)
   │ 1
   │
   ├── 1 ───── user_settings
   │
   └── N ───── todos ──── N todo_sessions
```

---

## 5) 제약/정합성 규칙

- `mini_day`: 0~3 고정
- `day_order`: 0 이상
- MiniDays: 각 구간은 start < end, 구간 간 공백 허용
- Session은 **MVP 포함** (클라이언트는 `sessions`를 초 단위로 로컬 보관 + 서버 저장)
