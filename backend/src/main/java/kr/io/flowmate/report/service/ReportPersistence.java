package kr.io.flowmate.report.service;

import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.repository.ReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ReportPersistence {

    private final ReportRepository reportRepository;
    private final ObjectMapper objectMapper;

    /**
     * 같은 기간 리포트가 있으면 덮어쓰고(재생성) 없으면 만든다. 조회 후 INSERT 대신 upsert 한 문장으로 처리해
     * 같은 기간 생성 요청이 동시에 들어와도 충돌하지 않는다.
     */
    @Transactional
    public ReportResponse upsertAndFetch(
        String userId, ReportType type, LocalDate periodStart, AiReportGenerator.Result result
    ) {
        // reports.updated_at은 초 단위 컬럼이라 저장값과 같도록 초로 자른다
        Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        // 엔티티의 JSON 매핑과 같은 키(@JsonProperty("try"), null 필드 포함)로 직렬화된다
        String contentJson = objectMapper.writeValueAsString(result.content());
        reportRepository.upsert(UUID.randomUUID().toString(), userId, type.name(), periodStart,
            contentJson, result.promptVersion(), now);

        // upsert가 이 트랜잭션의 첫 쿼리이고 행 락을 커밋까지 쥐므로, 다시 읽은 행은 방금 확정된 내용이다
        return reportRepository.findByUserIdAndTypeAndPeriodStart(userId, type, periodStart)
            .map(ReportResponse::from)
            .orElseThrow(() -> new IllegalStateException("저장한 리포트를 찾을 수 없습니다."));
    }
}
