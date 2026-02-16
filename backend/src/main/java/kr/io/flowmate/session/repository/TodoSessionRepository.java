package kr.io.flowmate.session.repository;

import kr.io.flowmate.session.domain.TodoSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TodoSessionRepository extends JpaRepository<TodoSession, String> {

    interface SessionAggregate {
        long getSessionCount();
        long getSessionFocusSeconds();
    }

    Optional<TodoSession> findByTodoIdAndClientSessionId(String todoId, String clientSessionId);

    Optional<TodoSession> findTopByTodoIdOrderBySessionOrderDesc(String todoId);

    List<TodoSession> findAllByTodoIdOrderBySessionOrderAsc(String todoId);

    @Query("""
            select
                count(s) as sessionCount,
                coalesce(sum(s.sessionFocusSeconds), 0) as sessionFocusSeconds
            from TodoSession s
            where s.todoId = :todoId
            """)
    SessionAggregate summarizeByTodoId(@Param("todoId") String todoId);

}
