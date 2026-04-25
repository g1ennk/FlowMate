package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

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

    private final TimerStateRepository timerStateRepository;
    private final TodoRepository todoRepository;
    private final SseEmitterRegistry sseEmitterRegistry;
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
            // TodoService.scheduleReview 와 동일한 DataIntegrityViolationException catch-retry 패턴.
            log.warn("timer state PK 충돌, 재조회 후 업데이트. todoId={}", todoId);
            timerState = timerStateRepository.findByUserIdAndTodoId(userId, todoId)
                    .orElseThrow(() -> e);
            newVersion = nextVersion(timerState.getVersion());
            timerState.update(stateJson, newVersion);
            timerStateRepository.saveAndFlush(timerState);
        }

        Object responseState = isIdle ? null : request.getState();
        broadcast(userId, todoId, responseState, newVersion);

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

    // SSE broadcast 는 fire-and-forget.
    // 전송 실패가 호출자 트랜잭션에 영향을 주지 않도록 SseEmitterRegistry 가 모든 예외를 흡수한다.
    // 직렬화 실패만 여기서 로깅하고 전파하지 않으며, 클라이언트는 GET /api/timer/state 로 보정 가능하다.
    private void broadcast(String userId, String todoId, Object state, long version) {
        try {
            String json = objectMapper.writeValueAsString(
                    new TimerStateResponse(todoId, state, version)
            );
            sseEmitterRegistry.broadcast(userId, SseEmitter.event().name("timer-state").data(json));
        } catch (JacksonException e) {
            log.warn("SSE broadcast 직렬화 실패. userId={}, todoId={}", userId, todoId, e);
        }
    }
}
