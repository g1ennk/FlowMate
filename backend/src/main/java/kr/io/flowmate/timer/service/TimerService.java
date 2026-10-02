package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
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

        boolean isIdle = IDLE_STATUS.equals(request.getStatus());
        String stateJson = isIdle ? null : serializeState(request.getState());
        // TIMESTAMP(3)에 그대로 들어가도록 밀리초로 맞춘다. MySQL은 밀리초 미만을 반올림한다
        Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        // 최초 저장과 갱신을 한 문장으로 처리하고 version은 DB가 +1 한다.
        // 이 경로에서는 TimerState 엔티티를 로드하지 않는다. 로드하면 upsert 결과와 1차 캐시가 어긋난다.
        try {
            timerStateRepository.upsert(todoId, userId, stateJson, now);
        } catch (DataIntegrityViolationException e) {
            // 소유권 확인 뒤 Todo가 삭제된 경합이다. 같은 트랜잭션에서 복구하지 않고 404로 끝낸다
            if (isTodoForeignKeyViolation(e)) {
                throw new TodoNotFoundException(todoId);
            }
            throw e;
        }
        long version = timerStateRepository.findVersionByTodoId(todoId);

        applicationEventPublisher.publishEvent(TimerStateChangedEvent.of(userId, todoId, version, stateJson));

        Object responseState = isIdle ? null : request.getState();
        return new TimerStateResponse(todoId, responseState, version);
    }

    public List<TimerStateResponse> getActiveStates(String userId) {
        // 24시간 넘게 갱신이 없는 활성 상태는 복원하지 않는다. 행은 지우지 않는다(version 연속성)
        Instant threshold = Instant.now().truncatedTo(ChronoUnit.MILLIS).minus(STALE_TTL_HOURS, ChronoUnit.HOURS);
        return timerStateRepository.findActiveSince(userId, threshold).stream()
                .map(this::toResponse)
                .toList();
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
