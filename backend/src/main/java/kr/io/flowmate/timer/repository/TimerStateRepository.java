package kr.io.flowmate.timer.repository;

import kr.io.flowmate.timer.domain.TimerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface TimerStateRepository extends JpaRepository<TimerState, String> {

    // lock 없는 일반 SELECT.
    // 기존 PESSIMISTIC_WRITE 는 absent row 에 gap lock 을 걸어 데드락을 유발했으므로 제거.
    // 동시 first insert 충돌은 서비스 레이어의 DataIntegrityViolationException catch 로 처리한다.
    Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);

    List<TimerState> findAllByUserIdOrderByUpdatedAtDesc(String userId);

    // TTL cleanup: threshold 이전 stale row 를 단일 DELETE 로 정리한다 (row 마다 쿼리 회피).
    // clearAutomatically=true 로 후속 SELECT 가 1차 캐시가 아닌 DB 기준으로 읽히도록 보장한다.
    @Modifying(clearAutomatically = true)
    @Query("delete from TimerState t where t.userId = :userId and t.updatedAt < :threshold")
    int deleteStaleByUserId(String userId, Instant threshold);

    /**
     * 같은 Todo의 최초 저장과 갱신을 한 문장으로 처리한다.
     * version은 새 행이면 1, 기존 행이면 DB가 +1 한다. 같은 Todo의 동시 쓰기는 InnoDB 행 X락으로 직렬화된다.
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
