package kr.io.flowmate.report.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("ReportGuardConfig")
class ReportGuardConfigTest {

    @Test
    @DisplayName("기본값: lock TTL 60s는 Gemini 최악 49s + 저장 여유 5s를 덮는다")
    void defaults_valid() {
        assertThatCode(() -> ReportGuardConfig.validate(new ReportGuardProperties(), new GeminiProperties()))
            .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("read timeout을 늘려 lock TTL보다 길어지면 시작 시 실패한다")
    void lockShorterThanGemini_fails() {
        GeminiProperties gemini = new GeminiProperties();
        gemini.setReadTimeoutMs(58_000);
        ReportGuardProperties guard = new ReportGuardProperties();
        guard.setLockTtl(Duration.ofSeconds(60));

        assertThatThrownBy(() -> ReportGuardConfig.validate(guard, gemini))
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("lock-ttl");
    }
}
