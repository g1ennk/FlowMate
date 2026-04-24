-- Phase 2 (2026-04-25): JPA AuditingEntityListener 가 updated_at 을 명시값으로 항상 전송하므로
-- DDL 레벨의 ON UPDATE CURRENT_TIMESTAMP 는 dead. 제거하여 정합성 회복.
-- DEFAULT CURRENT_TIMESTAMP 는 유지 (Auditing 누락 시 안전망 + 기존 row 영향 없음).
-- 참고: refresh_tokens, social_accounts 는 append-only 라 updated_at 컬럼 자체 없음 — 범위 외.

-- 1) user_settings 에 created_at 컬럼 신규 (V1 에 누락. CreatedTimeEntity/BaseTimeEntity 통일을 위해 추가).
--    기존 row 는 DEFAULT CURRENT_TIMESTAMP 로 backfill.
ALTER TABLE user_settings
    ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER day3_end_min;

-- 2) ON UPDATE CURRENT_TIMESTAMP 제거 (5 테이블, 컬럼 타입 보존).
ALTER TABLE todos          MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE todo_sessions  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE reviews        MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE user_settings  MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users          MODIFY COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- timer_states 는 milliseconds precision 유지 (TIMESTAMP(3)).
ALTER TABLE timer_states   MODIFY COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
