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
}
