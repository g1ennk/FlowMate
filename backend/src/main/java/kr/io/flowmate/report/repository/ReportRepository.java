package kr.io.flowmate.report.repository;

import kr.io.flowmate.report.domain.Report;
import kr.io.flowmate.report.domain.ReportType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface ReportRepository extends JpaRepository<Report, String> {

    Optional<Report> findByUserIdAndTypeAndPeriodStart(
        String userId,
        ReportType type,
        LocalDate periodStart
    );

    /**
     * 같은 기간 리포트(uq_reports_user_type_period)의 최초 저장과 재생성을 한 문장으로 처리한다.
     * 동시 최초 저장은 UNIQUE 인덱스의 행 락으로 직렬화되어, 나중 요청은 충돌 대신 같은 행을 덮어쓴다.
     * id와 created_at은 새 행일 때만 쓰인다. content는 JSON 문자열, 시각은 호출자가 바인딩한다.
     */
    @Modifying
    @Query(value = """
        INSERT INTO reports (id, user_id, type, period_start, content, prompt_version, created_at, updated_at)
        VALUES (:id, :userId, :type, :periodStart, :contentJson, :promptVersion, :now, :now) AS incoming
        ON DUPLICATE KEY UPDATE
            content        = incoming.content,
            prompt_version = incoming.prompt_version,
            updated_at     = incoming.updated_at
        """, nativeQuery = true)
    void upsert(String id, String userId, String type, LocalDate periodStart,
                String contentJson, String promptVersion, Instant now);
}
