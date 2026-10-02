package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.service.TodoService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 타이머 쓰기 계약(원자적 upsert, Todo별 순차 version, 확정 version 재조회)을 실제 MySQL 8.0에서 검증한다.
 */
class TimerStateWriteContractIT extends TimerIntegrationTest {

    private static final String RUNNING_JSON = "{\"status\":\"running\"}";

    @Autowired
    private TimerStateRepository timerStateRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private TodoService todoService;

    @Autowired
    private TimerService timerService;

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

    @Test
    void 응답과_DB와_커밋_후_이벤트의_version과_상태가_일치한다() {
        String userId = newUser();
        String todoId = newTodo(userId);
        clearInvocations(sseBroadcaster);

        TimerStateResponse response = timerService.upsertState(userId, todoId, runningRequest());

        ArgumentCaptor<TimerStateChangedEvent> event = ArgumentCaptor.forClass(TimerStateChangedEvent.class);
        verify(sseBroadcaster, times(1)).onTimerStateChanged(event.capture());
        TimerState saved = timerStateRepository.findById(todoId).orElseThrow();
        assertThat(response.version()).isEqualTo(saved.getVersion());
        assertThat(event.getValue().version()).isEqualTo(saved.getVersion());
        assertThat(event.getValue().state()).isEqualTo(saved.getStateJson());
    }

    @Test
    void 다른_사용자의_Todo에_저장하면_404이고_행도_이벤트도_생기지_않는다() {
        String ownerId = newUser();
        String todoId = newTodo(ownerId);
        clearInvocations(sseBroadcaster);

        assertThatThrownBy(() -> timerService.upsertState(newUser(), todoId, runningRequest()))
                .isInstanceOf(TodoNotFoundException.class);

        assertThat(timerRowCount(todoId)).isZero();
        verify(sseBroadcaster, never()).onTimerStateChanged(any());
    }

    private static TimerStatePushRequest runningRequest() {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(Map.of("status", "running"));
        return request;
    }

    @Test
    void upsert는_기존_행을_갱신할_때도_부모_Todo_행에_공유_잠금을_커밋까지_잡는다() {
        String userId = newUser();
        String todoId = newTodo(userId);
        upsertAndReadVersion(todoId, userId, RUNNING_JSON, now());

        List<String> locks = tx().execute(status -> {
            timerStateRepository.upsert(todoId, userId, null, now());
            // 트랜잭션이 열려 있는 동안 이 Todo에 걸린 레코드 잠금을 다른 연결(root)로 읽는다
            return recordLocksOn(todoId);
        });

        // FK 검사 때문에 갱신 경로에서도 부모 todos 행에 S락이 걸린다. 정합성은 이 잠금에 의존하지 않는다
        assertThat(locks).contains("todos:S,REC_NOT_GAP", "timer_states:X,REC_NOT_GAP");
    }

    private static List<String> recordLocksOn(String key) {
        String sql = "select concat(object_name, ':', lock_mode) from performance_schema.data_locks "
                + "where lock_type = 'RECORD' and lock_data like ?";
        try (Connection root = openRootConnection();
             PreparedStatement statement = root.prepareStatement(sql)) {
            statement.setString(1, "%" + key + "%");
            List<String> locks = new ArrayList<>();
            try (ResultSet rows = statement.executeQuery()) {
                while (rows.next()) {
                    locks.add(rows.getString(1));
                }
            }
            return locks;
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
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

}
