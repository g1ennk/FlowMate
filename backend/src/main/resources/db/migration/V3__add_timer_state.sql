CREATE TABLE timer_states
(
    todo_id    VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    state_json TEXT         NULL,               -- idle 시 NULL (soft delete), non-idle 시 JSON blob
    version    BIGINT       NOT NULL DEFAULT 0, -- 단조 증가. max(now, lastVersion+1). 앱 서버 계산
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT fk_timer_states_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
);

CREATE INDEX idx_timer_states_user ON timer_states (user_id, updated_at DESC);
