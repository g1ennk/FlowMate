package kr.io.flowmate.todo.repository;

import kr.io.flowmate.todo.domain.Todo;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface TodoRepository extends JpaRepository<Todo, String> {

    @Query("SELECT t FROM Todo t WHERE t.userId = :userId ORDER BY t.date, t.miniDay, t.dayOrder, t.createdAt")
    List<Todo> findAllByUserId(@Param("userId") String userId);

    @Query("SELECT t FROM Todo t WHERE t.userId = :userId AND t.date = :date ORDER BY t.miniDay, t.dayOrder, t.createdAt")
    List<Todo> findAllByUserIdAndDate(@Param("userId") String userId, @Param("date") LocalDate date);

    Optional<Todo> findByIdAndUserId(String id, String userId);

    @Query("SELECT t FROM Todo t WHERE t.id IN :ids AND t.userId = :userId")
    List<Todo> findAllByIdInAndUserId(@Param("ids") List<String> ids, @Param("userId") String userId);

    Optional<Todo> findByUserIdAndOriginalTodoIdAndReviewRound(String userId, String originalTodoId, Integer reviewRound);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT t FROM Todo t WHERE t.id = :id AND t.userId = :userId")
    Optional<Todo> findByIdAndUserIdForUpdate(@Param("id") String id, @Param("userId") String userId);

    @Query("""
            SELECT COALESCE(MAX(t.dayOrder), -1)
            FROM Todo t
            WHERE t.userId = :userId
              AND t.date = :date
              AND t.miniDay = :miniDay
              AND t.done = false
            """)
    int findMaxDayOrderForUndone(@Param("userId") String userId, @Param("date") LocalDate date, @Param("miniDay") int miniDay);
}
