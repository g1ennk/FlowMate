package kr.io.flowmate.timer.service;

import kr.io.flowmate.support.MySqlIntegrationTest;
import kr.io.flowmate.timer.sse.SseBroadcaster;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.sql.SQLException;
import java.time.LocalDate;
import java.util.UUID;

/**
 * 타이머 통합 테스트의 공통 픽스처.
 * SseBroadcaster spy를 여기서 한 번만 선언해 타이머 IT들이 같은 Spring 컨텍스트를 공유하게 한다.
 */
abstract class TimerIntegrationTest extends MySqlIntegrationTest {

    @MockitoSpyBean
    protected SseBroadcaster sseBroadcaster;

    @Autowired
    protected TodoRepository todoRepository;

    @Autowired
    protected JdbcTemplate jdbcTemplate;

    protected String newTodo(String userId) {
        return todoRepository.save(Todo.create(userId, "timer-it", null, LocalDate.now(), 0, 0)).getId();
    }

    protected static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }

    protected int timerRowCount(String todoId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from timer_states where todo_id = ?", Integer.class, todoId);
        return count;
    }

    protected static int mysqlErrorCode(Throwable e) {
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return sql.getErrorCode();
            }
        }
        return -1;
    }

    /** 실패 원인을 MySQL 오류 코드 기준으로 분류한다. SQL 오류가 아니면 예외 클래스 이름. */
    protected static String classify(Throwable e) {
        return switch (mysqlErrorCode(e)) {
            case -1 -> e.getClass().getSimpleName();
            case 1213 -> "DEADLOCK(1213)";
            case 1205 -> "LOCK_WAIT_TIMEOUT(1205)";
            case 1062 -> "DUPLICATE_KEY(1062)";
            case 1452 -> "FK_PARENT_MISSING(1452)";
            default -> "SQL(" + mysqlErrorCode(e) + ")";
        };
    }
}
