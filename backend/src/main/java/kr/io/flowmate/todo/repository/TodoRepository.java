package kr.io.flowmate.todo.repository;

import kr.io.flowmate.todo.domain.Todo;
import org.springframework.data.jpa.repository.JpaRepository;
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

    // 특정 Todo 조회
    Optional<Todo> findByIdAndUserId(String id, String userId);

}
