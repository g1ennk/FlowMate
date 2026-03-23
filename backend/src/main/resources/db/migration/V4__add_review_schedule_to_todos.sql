ALTER TABLE todos
    ADD COLUMN review_round INT NULL COMMENT '복습 회차 (null=일반 Todo, 1~6=복습)',
    ADD COLUMN original_todo_id VARCHAR(36) NULL COMMENT '복습 체인의 루트 Todo ID';

CREATE UNIQUE INDEX uq_todos_review_round
    ON todos (user_id, original_todo_id, review_round);

CREATE INDEX idx_todos_original
    ON todos (user_id, original_todo_id);
