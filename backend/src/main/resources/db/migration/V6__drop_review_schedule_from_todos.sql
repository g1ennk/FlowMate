-- 복습 스케줄(review_round + original_todo_id 체인) 기능 제거.
-- V4 에서 추가했던 컬럼·인덱스를 모두 정리한다.

DROP INDEX uq_todos_review_round ON todos;
DROP INDEX idx_todos_original ON todos;

ALTER TABLE todos
    DROP COLUMN review_round,
    DROP COLUMN original_todo_id;
