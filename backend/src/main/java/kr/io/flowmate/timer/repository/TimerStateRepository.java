package kr.io.flowmate.timer.repository;

import kr.io.flowmate.timer.domain.TimerState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface TimerStateRepository extends JpaRepository<TimerState, String> {

    Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);

    List<TimerState> findAllByUserIdOrderByUpdatedAtDesc(String userId);

    void deleteByUserIdAndTodoId(String userId, String todoId);

    @Modifying(clearAutomatically = true)
    @Query("DELETE FROM TimerState t WHERE t.userId = :userId AND t.updatedAt < :threshold")
    void deleteStaleByUserId(@Param("userId") String userId, @Param("threshold") Instant threshold);
}
