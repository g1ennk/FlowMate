CREATE TABLE reports (
    id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    type VARCHAR(10) NOT NULL,
    period_start DATE NOT NULL,
    content JSON NOT NULL,
    prompt_version VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_reports_user_type_period UNIQUE (user_id, type, period_start)
);

CREATE INDEX idx_reports_user_created ON reports (user_id, created_at DESC);
