CREATE TABLE todos
(
    id                    VARCHAR(36) PRIMARY KEY,
    user_id               VARCHAR(36)  NOT NULL,           -- X-Client-Id (게스트 식별자)
    title                 VARCHAR(200) NOT NULL,
    note                  TEXT,
    date                  DATE         NOT NULL,
    mini_day              INT          NOT NULL DEFAULT 0, -- 0~3
    day_order             INT          NOT NULL DEFAULT 0,
    is_done               TINYINT(1)   NOT NULL DEFAULT 0,
    session_count         INT          NOT NULL DEFAULT 0,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    timer_mode            VARCHAR(20),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_todos_user_order ON todos (user_id, date, mini_day, day_order, created_at);

CREATE TABLE todo_sessions
(
    id                    VARCHAR(36) PRIMARY KEY,
    todo_id               VARCHAR(36) NOT NULL,
    user_id               VARCHAR(36) NOT NULL, -- X-Client-Id
    client_session_id     VARCHAR(36) NOT NULL, -- 프론트 멱등 키
    session_focus_seconds INT         NOT NULL DEFAULT 0,
    break_seconds         INT         NOT NULL DEFAULT 0,
    session_order         INT         NOT NULL,
    created_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 세션은 반드시 투두에 속하고, 해당 투두가 삭제되면 세션도 같이 삭제
    CONSTRAINT fk_todo_sessions_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE,

    -- 세션 순서는 중복되면 안됨. (유니크 인덱스 가능성)
    CONSTRAINT uq_todo_sessions_order
        UNIQUE (todo_id, session_order),

    -- 같은 todo에서 같은 client_session_id는 1회만 허용 (멱등)
    CONSTRAINT uq_todo_sessions_client_session
        UNIQUE (todo_id, client_session_id)
);

-- CREATE INDEX idx_sessions_todo ON todo_sessions (todo_id); -- 나중에 EXPLAIN이나 성능 보고 결정
CREATE INDEX idx_sessions_user ON todo_sessions (user_id); -- 사용자 통계 대비

CREATE TABLE user_settings
(
    user_id            VARCHAR(36) PRIMARY KEY, -- X-Client-Id

    flow_min           INT         NOT NULL DEFAULT 25,
    break_min          INT         NOT NULL DEFAULT 5,
    long_break_min     INT         NOT NULL DEFAULT 15,
    cycle_every        INT         NOT NULL DEFAULT 4,

    auto_start_break   TINYINT(1)  NOT NULL DEFAULT 0,
    auto_start_session TINYINT(1)  NOT NULL DEFAULT 0,

    day1_label         VARCHAR(50) NOT NULL DEFAULT '오전',
    day1_start_min     INT         NOT NULL DEFAULT 360,
    day1_end_min       INT         NOT NULL DEFAULT 720,

    day2_label         VARCHAR(50) NOT NULL DEFAULT '오후',
    day2_start_min     INT         NOT NULL DEFAULT 720,
    day2_end_min       INT         NOT NULL DEFAULT 1080,

    day3_label         VARCHAR(50) NOT NULL DEFAULT '저녁',
    day3_start_min     INT         NOT NULL DEFAULT 1080,
    day3_end_min       INT         NOT NULL DEFAULT 1440,

    updated_at         TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


CREATE TABLE reviews
(
    id           VARCHAR(36) PRIMARY KEY,
    user_id      VARCHAR(36) NOT NULL, -- X-Client-Id
    type         VARCHAR(20) NOT NULL,
    period_start DATE        NOT NULL,
    period_end   DATE        NOT NULL,
    content      TEXT        NOT NULL,
    created_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 같은 사용자에 대해 같은 타입의 같은 기간 시작 = 회고는 딱 한 개만 존재 가능
    CONSTRAINT uniq_reviews_user_period
        UNIQUE (user_id, type, period_start)
);

CREATE INDEX idx_reviews_user_period ON reviews (user_id, period_start);
