package kr.io.flowmate.todo.repository;

import jakarta.persistence.LockModeType;
import kr.io.flowmate.todo.domain.Todo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface TodoRepository extends JpaRepository<Todo, String> {

    // 사용자의 모든 Todo를 UI 표시 순서대로 조회
    List<Todo> findAllByUserIdOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(String userId);

    // 특정 날짜의 Todo를 UI 표시 순서대로 조회
    List<Todo> findAllByUserIdAndDateOrderByMiniDayAscDayOrderAscCreatedAtAsc(
            String userId,
            LocalDate date
    );

    // 기간 범위의 Todo를 UI 표시 순서대로 조회
    List<Todo> findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(
            String userId,
            LocalDate startDate,
            LocalDate endDate
    );


    // 특정 Todo 조회
    Optional<Todo> findByIdAndUserId(String id, String userId);

    Optional<Todo> findByUserIdAndOriginalTodoIdAndReviewRound(String userId, String originalTodoId, Integer reviewRound);

    // 세션 생성 시 순번 계산 레이스를 줄이기 위해 Todo 행을 잠근다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Todo t where t.id = :id and t.userId = :userId")
    Optional<Todo> findByIdAndUserIdForUpdate(String id, String userId);

    @Query("""
            select coalesce(max(t.dayOrder), -1)
            from Todo t
            where t.userId = :userId
              and t.date = :date
              and t.miniDay = :miniDay
              and t.done = false
            """)
    int findMaxDayOrderForUndone(String userId, LocalDate date, int miniDay);

}
