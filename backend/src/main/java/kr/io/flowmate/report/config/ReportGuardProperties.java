package kr.io.flowmate.report.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** AI 리포트 생성 중복 방지 lock 설정 */
@ConfigurationProperties(prefix = "report.guard")
@Getter
@Setter
public class ReportGuardProperties {
    /** Gemini 최악 대기(49s)와 저장 시간을 덮어야 한다. 시작할 때 검사한다 */
    private Duration lockTtl = Duration.ofSeconds(60);
}
