package kr.io.flowmate.timer.repository;

import jakarta.persistence.LockModeType;
import kr.io.flowmate.timer.domain.TimerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TimerStateRepository extends JpaRepository<TimerState, String> {

    /**
     * 같은 todo에 이미 timer_states row가 있으면,
     * SELECT FOR UPDATE로 그 row를 잠가서 동시에 들어온 수정 요청을 순서대로 처리할 수 있다.
     * 그래서 version이 꼬이지 않는다.
     * <p>
     * 하지만 아직 row가 없는 첫 요청에서는 잠글 대상이 없어서,
     * 두 요청이 동시에 insert를 시도할 수 있다.
     * 이때 하나는 성공하고 다른 하나는 PK 충돌로 실패할 수 있다.
     * 실패한 쪽은 클라이언트 retry로 다시 시도하면 그땐 row가 이미 있으므로 정상 처리된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TimerState t where t.userId = :userId and t.todoId = :todoId")
    Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);

    List<TimerState> findAllByUserIdOrderByUpdatedAtDesc(String userId);

    void deleteByUserIdAndTodoId(String userId, String todoId);
}
