package kr.io.flowmate.report.config;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(ReportGuardProperties.class)
public class ReportGuardConfig implements InitializingBean {

    /** 생성이 끝나기 전에 lock이 풀리면 같은 key로 Gemini가 다시 호출될 수 있다 */
    static final long PERSISTENCE_MARGIN_MS = 5_000;

    private final ReportGuardProperties guardProps;
    private final GeminiProperties geminiProps;

    public ReportGuardConfig(ReportGuardProperties guardProps, GeminiProperties geminiProps) {
        this.guardProps = guardProps;
        this.geminiProps = geminiProps;
    }

    @Override
    public void afterPropertiesSet() {
        validate(guardProps, geminiProps);
    }

    static void validate(ReportGuardProperties guardProps, GeminiProperties geminiProps) {
        long required = geminiProps.worstCaseMs() + PERSISTENCE_MARGIN_MS;
        if (guardProps.getLockTtl().toMillis() < required) {
            throw new IllegalStateException(
                "report.guard.lock-ttl(" + guardProps.getLockTtl().toMillis() + "ms)은 Gemini 최악 대기 + 저장 여유("
                    + required + "ms) 이상이어야 합니다");
        }
    }
}
