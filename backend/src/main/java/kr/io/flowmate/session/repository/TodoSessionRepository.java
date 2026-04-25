package kr.io.flowmate.session.repository;

import kr.io.flowmate.session.domain.TodoSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TodoSessionRepository extends JpaRepository<TodoSession, String> {

    Optional<TodoSession> findByTodoIdAndClientSessionId(String todoId, String clientSessionId);

    Optional<TodoSession> findTopByTodoIdOrderBySessionOrderDesc(String todoId);

    List<TodoSession> findAllByTodoIdOrderBySessionOrderAsc(String todoId);

}
