package kr.io.flowmate.timer.domain;

import jakarta.persistence.*;
import kr.io.flowmate.common.domain.BaseTimeEntity;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Todo당 최대 1행인 타이머 런타임 스냅샷. 조회 매핑 전용이다.
 * 저장은 TimerStateRepository.upsert(네이티브 SQL)만 하므로 JPA로 persist·merge하지 않는다.
 * 그래서 BaseTimeEntity의 Auditing은 이 엔티티에서 동작하지 않고, createdAt·updatedAt은 upsert가 바인딩한 값이다.
 */
@Entity
@Table(name = "timer_states")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TimerState extends BaseTimeEntity {

    @Id
    @Column(name = "todo_id", nullable = false, length = 36)
    private String todoId;

    @Column(name = "user_id", nullable = false, length = 36)
    private String userId;

    @Column(name = "state_json", columnDefinition = "TEXT")
    private String stateJson;

    // Todo별로 저장할 때마다 DB가 1씩 올리는 순서 번호. 시각이 아니다. 기존 행은 시간 기반 값에서 이어서 증가한다
    @Column(nullable = false)
    private long version;
}
