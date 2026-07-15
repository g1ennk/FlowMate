CREATE INDEX idx_refresh_tokens_active_by_user
    ON auth_refresh_tokens (user_id, revoked_at, expires_at);
