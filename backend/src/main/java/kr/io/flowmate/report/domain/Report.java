package kr.io.flowmate.report.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(
    name = "reports",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_reports_user_type_period",
        columnNames = {"user_id", "type", "period_start"}
    )
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Report extends BaseTimeEntity {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", length = 36, nullable = false)
    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(length = 10, nullable = false)
    private ReportType type;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "JSON")
    private ReportContent content;

    @Column(name = "prompt_version", length = 20)
    private String promptVersion;

    public static Report create(
        String userId,
        ReportType type,
        LocalDate periodStart,
        ReportContent content,
        String promptVersion
    ) {
        Report r = new Report();
        r.id = UUID.randomUUID().toString();
        r.userId = userId;
        r.type = type;
        r.periodStart = periodStart;
        r.content = content;
        r.promptVersion = promptVersion;
        return r;
    }

    public void updateContent(ReportContent content, String promptVersion) {
        this.content = content;
        this.promptVersion = promptVersion;
    }
}
