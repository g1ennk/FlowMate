package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class TimerService {

    private static final String IDLE_STATUS = "idle";
    private static final long STALE_TTL_HOURS = 24;
    private static final int MYSQL_FK_PARENT_MISSING = 1452;
    static final String TODO_FOREIGN_KEY = "fk_timer_states_todo";

    private final TimerStateRepository timerStateRepository;
    private final TodoRepository todoRepository;
    private final ApplicationEventPublisher applicationEventPublisher;
    private final ObjectMapper objectMapper;

    @Transactional
    public TimerStateResponse upsertState(String userId, String todoId, TimerStatePushRequest request) {
        todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));

        TimerState timerState = timerStateRepository
                .findByUserIdAndTodoId(userId, todoId)
                .orElseGet(() -> TimerState.create(todoId, userId));

        boolean isIdle = IDLE_STATUS.equals(request.getStatus());
        String stateJson = isIdle ? null : serializeState(request.getState());
        long newVersion = nextVersion(timerState.getVersion());
        timerState.update(stateJson, newVersion);

        try {
            timerStateRepository.saveAndFlush(timerState);
        } catch (DataIntegrityViolationException e) {
            // 동시 first insert 로 PK 충돌 발생. winner 가 이미 더 큰 version 을 저장했을 수 있으므로
            // 재조회한 row 의 version 위에서 newVersion 을 다시 계산해야 단조 증가가 보장된다.
            log.warn("timer state PK 충돌, 재조회 후 업데이트. todoId={}", todoId);
            timerState = timerStateRepository.findByUserIdAndTodoId(userId, todoId)
                    .orElseThrow(() -> e);
            newVersion = nextVersion(timerState.getVersion());
            timerState.update(stateJson, newVersion);
            timerStateRepository.saveAndFlush(timerState);
        }

        applicationEventPublisher.publishEvent(
                TimerStateChangedEvent.of(userId, todoId, newVersion, stateJson)
        );

        Object responseState = isIdle ? null : request.getState();
        return new TimerStateResponse(todoId, responseState, newVersion);
    }

    @Transactional
    public List<TimerStateResponse> getActiveStates(String userId) {
        Instant threshold = Instant.now().minus(STALE_TTL_HOURS, ChronoUnit.HOURS);
        timerStateRepository.deleteStaleByUserId(userId, threshold);

        return timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(userId).stream()
                // idle row(state_json = null) 는 soft delete 상태이므로 활성 응답에서 제외
                .filter(state -> state.getStateJson() != null)
                .map(this::toResponse)
                .toList();
    }

    private long nextVersion(long lastVersion) {
        return Math.max(System.currentTimeMillis(), lastVersion + 1);
    }

    /**
     * upsert에서 난 무결성 오류가 "소유권 확인 뒤 Todo가 삭제된 경합"인지 판별한다.
     * MySQL 오류 코드 1452와 제약 이름이 모두 맞을 때만 true다. 다른 무결성 오류는 삼키지 않는다.
     * 패키지 전용인 이유: 결정적 재현 IT가 실제 MySQL 예외에 이 로직을 그대로 적용해 검증한다.
     */
    static boolean isTodoForeignKeyViolation(DataIntegrityViolationException e) {
        boolean parentMissing = false;
        String constraintName = null;
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation && violation.getConstraintName() != null) {
                constraintName = violation.getConstraintName();
            }
            if (cause instanceof SQLException sql && sql.getErrorCode() == MYSQL_FK_PARENT_MISSING) {
                parentMissing = true;
            }
        }
        return parentMissing && TODO_FOREIGN_KEY.equalsIgnoreCase(constraintName);
    }

    private String serializeState(Object state) {
        try {
            return objectMapper.writeValueAsString(state);
        } catch (JacksonException e) {
            throw new IllegalArgumentException("state 직렬화 실패", e);
        }
    }

    private TimerStateResponse toResponse(TimerState state) {
        try {
            return new TimerStateResponse(
                    state.getTodoId(),
                    objectMapper.readValue(state.getStateJson(), Object.class),
                    state.getVersion()
            );
        } catch (JacksonException e) {
            throw new IllegalStateException("state 역직렬화 실패. todoId=" + state.getTodoId(), e);
        }
    }
}
