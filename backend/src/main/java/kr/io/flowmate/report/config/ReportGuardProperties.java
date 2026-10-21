package kr.io.flowmate.report.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/** AI 리포트 생성 중복 방지 lock과 사용자 rate limit 설정 */
@ConfigurationProperties(prefix = "report.guard")
@Getter
@Setter
public class ReportGuardProperties {
    /** Gemini 최악 대기(49s)와 저장 시간을 덮어야 한다. 시작할 때 검사한다 */
    private Duration lockTtl = Duration.ofSeconds(60);
    /** 사용자당 window 안에서 Gemini를 부를 수 있는 횟수 */
    private int userLimit = 10;
    /** 사용자 첫 생성 요청부터 시작하는 고정 window */
    private Duration userWindow = Duration.ofHours(1);
    /** 같은 (type, periodStart) 리포트를 성공적으로 만든 뒤 다시 만들 수 없는 시간 */
    private Duration cooldown = Duration.ofSeconds(30);
}
