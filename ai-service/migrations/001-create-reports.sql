CREATE TABLE IF NOT EXISTS reports
(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        VARCHAR(36) NOT NULL,
    type           VARCHAR(10) NOT NULL,
    period_start   DATE        NOT NULL,
    content JSONB NOT NULL,
    prompt_version VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (user_id, type, period_start)
);
