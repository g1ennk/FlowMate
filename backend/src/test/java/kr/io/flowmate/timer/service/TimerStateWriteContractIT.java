package kr.io.flowmate.timer.service;

import kr.io.flowmate.support.MySqlIntegrationTest;
import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.repository.TodoRepository;
import kr.io.flowmate.todo.service.TodoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

/**
 * 타이머 쓰기 계약(원자적 upsert, Todo별 순차 version, 확정 version 재조회)을 실제 MySQL 8.0에서 검증한다.
 */
class TimerStateWriteContractIT extends MySqlIntegrationTest {

    private static final String RUNNING_JSON = "{\"status\":\"running\"}";

    @Autowired
    private TimerStateRepository timerStateRepository;

    @Autowired
    private TodoRepository todoRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private TodoService todoService;

    @Test
    void 첫_저장은_version_1로_행을_만든다() {
        String userId = newUser();
        String todoId = newTodo(userId);

        long version = upsertAndReadVersion(todoId, userId, RUNNING_JSON, now());

        assertThat(version).isEqualTo(1L);
        TimerState saved = timerStateRepository.findById(todoId).orElseThrow();
        assertThat(saved.getStateJson()).isEqualTo(RUNNING_JSON);
        assertThat(saved.getCreatedAt()).isEqualTo(saved.getUpdatedAt());
    }

    @Test
    void 첫_저장이_idle이어도_NULL_상태의_행이_version_1로_생긴다() {
        String userId = newUser();
        String todoId = newTodo(userId);

        long version = upsertAndReadVersion(todoId, userId, null, now());

        assertThat(version).isEqualTo(1L);
        assertThat(timerStateRepository.findById(todoId).orElseThrow().getStateJson()).isNull();
    }

    @Test
    void idle로_바꿔도_행은_남고_version은_계속_증가한다() {
        String userId = newUser();
        String todoId = newTodo(userId);

        assertThat(upsertAndReadVersion(todoId, userId, RUNNING_JSON, now())).isEqualTo(1L);
        assertThat(upsertAndReadVersion(todoId, userId, null, now())).isEqualTo(2L);
        assertThat(timerStateRepository.findById(todoId).orElseThrow().getStateJson()).isNull();
        assertThat(upsertAndReadVersion(todoId, userId, RUNNING_JSON, now())).isEqualTo(3L);
    }

    @Test
    void 시간_기반_version을_가진_기존_행은_그_값에서_1씩_이어서_증가한다() {
        String userId = newUser();
        String todoId = newTodo(userId);
        long legacyVersion = 1_759_380_000_123L;
        upsertAndReadVersion(todoId, userId, RUNNING_JSON, now());
        jdbcTemplate.update("update timer_states set version = ? where todo_id = ?", legacyVersion, todoId);

        long version = upsertAndReadVersion(todoId, userId, null, now());

        assertThat(version).isEqualTo(legacyVersion + 1);
    }

    @Test
    void 선행_스냅샷이_있어도_다른_트랜잭션이_만든_행을_갱신하고_자기_version을_읽는다() {
        String userId = newUser();
        String todoId = newTodo(userId);

        Long version = tx().execute(status -> {
            // 트랜잭션 A의 첫 일반 SELECT. REPEATABLE READ 스냅샷이 여기서 만들어진다
            todoRepository.findByIdAndUserId(todoId, userId).orElseThrow();
            // 트랜잭션 B가 같은 Todo의 행을 만들고 커밋한다 (version 1)
            runInOtherThread(() -> upsertAndReadVersion(todoId, userId, RUNNING_JSON, now()));
            timerStateRepository.upsert(todoId, userId, null, now());
            return timerStateRepository.findVersionByTodoId(todoId);
        });

        assertThat(version).isEqualTo(2L);
    }

    @Test
    void 소유권_확인_뒤_Todo가_삭제되면_upsert는_Todo_FK_위반으로_판별된다() {
        String userId = newUser();
        String todoId = newTodo(userId);

        Throwable thrown = catchThrowable(() -> tx().executeWithoutResult(status -> {
            // TimerService의 소유권 확인과 같은 SQL
            todoRepository.findByIdAndUserId(todoId, userId).orElseThrow();
            // 다른 트랜잭션이 Todo를 삭제하고 커밋한다
            runInOtherThread(() -> todoService.deleteTodo(userId, todoId));
            timerStateRepository.upsert(todoId, userId, RUNNING_JSON, now());
        }));

        String chain = describeChain(thrown);
        System.out.println("[1452 exception chain]" + chain);
        assertThat(thrown).as(chain).isInstanceOf(DataIntegrityViolationException.class);
        assertThat(mysqlErrorCode(thrown)).as(chain).isEqualTo(1452);
        assertThat(TimerService.isTodoForeignKeyViolation((DataIntegrityViolationException) thrown))
                .as(chain).isTrue();
        assertThat(timerRowCount(todoId)).isZero();
    }

    private static String describeChain(Throwable e) {
        StringBuilder chain = new StringBuilder();
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            chain.append(" <- ").append(cause.getClass().getName());
            if (cause instanceof org.hibernate.exception.ConstraintViolationException violation) {
                chain.append("[constraint=").append(violation.getConstraintName()).append(']');
            }
            if (cause instanceof SQLException sql) {
                chain.append("[errorCode=").append(sql.getErrorCode())
                        .append(", sqlState=").append(sql.getSQLState()).append(']');
            }
        }
        return chain.toString();
    }

    private static int mysqlErrorCode(Throwable e) {
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return sql.getErrorCode();
            }
        }
        return -1;
    }

    private long upsertAndReadVersion(String todoId, String userId, String stateJson, Instant now) {
        Long version = tx().execute(status -> {
            timerStateRepository.upsert(todoId, userId, stateJson, now);
            return timerStateRepository.findVersionByTodoId(todoId);
        });
        return version;
    }

    private TransactionTemplate tx() {
        return new TransactionTemplate(transactionManager);
    }

    private static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    private static void runInOtherThread(Runnable task) {
        try (ExecutorService other = Executors.newSingleThreadExecutor()) {
            other.submit(task).get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private int timerRowCount(String todoId) {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from timer_states where todo_id = ?", Integer.class, todoId);
        return count;
    }

    private String newTodo(String userId) {
        return todoRepository.save(Todo.create(userId, "timer-it", null, LocalDate.now(), 0, 0)).getId();
    }

    private static String newUser() {
        return "it-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
