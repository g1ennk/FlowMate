package kr.io.flowmate.timer.repository;

import kr.io.flowmate.timer.domain.TimerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface TimerStateRepository extends JpaRepository<TimerState, String> {

    /**
     * 같은 Todo의 최초 저장과 갱신을 한 문장으로 처리한다.
     * version은 새 행이면 1, 기존 행이면 DB가 +1 한다. 같은 Todo의 동시 쓰기는 InnoDB 행 X락으로 직렬화된다.
     * FK 검사 때문에 갱신 경로에서도 부모 todos 행에 공유(S) 잠금을 커밋까지 잡는다. 정합성은 이 잠금에 의존하지 않지만,
     * 같은 Todo의 세션 저장(Todo 행 X락)·Todo 수정과는 짧게 서로 기다린다.
     * 시각은 호출자가 바인딩한다. 이 SQL에서 NOW()·CURRENT_TIMESTAMP를 쓰지 않는다.
     * 쓰기 경로는 TimerState 엔티티를 로드하지 않으므로 flush/clear 강제 옵션을 쓰지 않는다.
     * 반환값(INSERT 1, UPDATE 2)은 CLIENT_FOUND_ROWS 설정에 따라 의미가 달라지므로 쓰지 않는다.
     */
    @Modifying
    @Query(value = """
            INSERT INTO timer_states (todo_id, user_id, state_json, version, created_at, updated_at)
            VALUES (:todoId, :userId, :stateJson, 1, :now, :now) AS incoming
            ON DUPLICATE KEY UPDATE
                state_json = incoming.state_json,
                version    = timer_states.version + 1,
                updated_at = incoming.updated_at
            """, nativeQuery = true)
    int upsert(String todoId, String userId, String stateJson, Instant now);

    // upsert 직후 같은 트랜잭션에서 확정 version을 읽는다. 값만 읽으므로 1차 캐시를 거치지 않는다
    @Query("select t.version from TimerState t where t.todoId = :todoId")
    long findVersionByTodoId(String todoId);

    // 복원 대상: idle이 아니고 threshold 이후에 갱신된 상태. TTL은 조회에서만 적용하고 행은 지우지 않는다
    @Query("""
            select t from TimerState t
            where t.userId = :userId
              and t.stateJson is not null
              and t.updatedAt >= :threshold
            order by t.updatedAt desc
            """)
    List<TimerState> findActiveSince(String userId, Instant threshold);
}
