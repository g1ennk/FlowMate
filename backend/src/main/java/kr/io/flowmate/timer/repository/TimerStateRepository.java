package kr.io.flowmate.timer.repository;

import kr.io.flowmate.timer.domain.TimerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TimerStateRepository extends JpaRepository<TimerState, String> {

    /**
     * lock 없는 일반 SELECT.
     * 기존 PESSIMISTIC_WRITE는 absent row에 gap lock을 걸어 데드락을 유발했으므로 제거.
     * 동시 first insert 충돌은 서비스 레이어의 DataIntegrityViolationException catch로 처리한다.
     */
    Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);

    List<TimerState> findAllByUserIdOrderByUpdatedAtDesc(String userId);

    void deleteByUserIdAndTodoId(String userId, String todoId);
}
