package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.TimerStateResponse;
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
import java.util.stream.Collectors;

@Slf4j
@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class TimerService {

    private final TimerStateRepository timerStateRepository;
    private final TodoRepository todoRepository;
    private final SseEmitterRegistry sseEmitterRegistry;
    private final ObjectMapper objectMapper;

    @Transactional
    public TimerStateResponse upsertState(String userId, String todoId, TimerStatePushRequest request) {
        // 이 todo가 현재 user 소유인지 먼저 검증
        todoRepository.findByIdAndUserId(todoId, userId)
                .orElseThrow(() -> new TodoNotFoundException(todoId));

        // 기존 timer_states row를 가져오되 row가 없으면 새 엔티티 생성
        TimerState timerState = timerStateRepository
                .findByUserIdAndTodoId(userId, todoId)
                .orElseGet(() -> TimerState.create(todoId, userId));

        // 현재 row의 마지막 version을 읽고, 새 version 계산
        long lastVersion = timerState.getVersion();
        long newVersion = Math.max(System.currentTimeMillis(), lastVersion + 1);

        boolean isIdle = "idle".equals(request.getStatus());

        // idle이면 stateJson = null (soft delete), 아니면 직렬화
        String stateJson;
        if (isIdle) {
            stateJson = null;
        } else {
            try {
                stateJson = objectMapper.writeValueAsString(request.getState());
            } catch (JacksonException e) {
                throw new IllegalArgumentException("state 직렬화 실패", e);
            }
        }

        timerState.update(stateJson, newVersion);

        try {
            timerStateRepository.saveAndFlush(timerState);
        } catch (DataIntegrityViolationException e) {
            // 동시 first insert로 PK 충돌 → row가 이미 생겼으니 다시 조회해서 업데이트.
            // saveAndFlush가 SQL을 즉시 실행하므로 재조회한 엔티티는 별도 인스턴스로 동작한다.
            // TodoService.scheduleReview와 동일한 패턴.
            log.warn("timer state PK 충돌, 재조회 후 업데이트. todoId={}", todoId);
            timerState = timerStateRepository.findByUserIdAndTodoId(userId, todoId)
                    .orElseThrow(() -> e);
            timerState.update(stateJson, newVersion);
            timerStateRepository.saveAndFlush(timerState);
        }

        // SSE broadcast
        Object responseState = isIdle ? null : request.getState();
        broadcast(userId, todoId, responseState, newVersion);

        return new TimerStateResponse(todoId, responseState, newVersion);
    }

    @Transactional
    public List<TimerStateResponse> getActiveStates(String userId) {
        // 현재 user의 timer_states row를 전부 가져옴
        List<TimerState> states = timerStateRepository.findAllByUserIdOrderByUpdatedAtDesc(userId);

        // TTL 기준 시각 계산하여 24시간이 넘은 row는 stale로 보고 정리 대상
        Instant threshold = Instant.now().minus(24, ChronoUnit.HOURS);

        // TTL cleanup
        states.stream()
                .filter(state -> state.getUpdatedAt().isBefore(threshold))
                .forEach(state -> timerStateRepository.deleteByUserIdAndTodoId(userId, state.getTodoId()));

        // 반환할 active state를 골라서 DTO로 변환
        return states.stream()
                .filter(s -> !s.getUpdatedAt().isBefore(threshold))
                // soft delete(idle) row 제외: state_json != null 인 것만 active로 본다
                .filter(s -> s.getStateJson() != null)
                .map(s -> {
                    try {
                        // DB의 JSON 문자열을 다시 Object로 역직렬화해서 응답에 넣음
                        return new TimerStateResponse(
                                s.getTodoId(),
                                objectMapper.readValue(s.getStateJson(), Object.class),
                                s.getVersion()
                        );
                    } catch (JacksonException e) {
                        throw new RuntimeException("state 역직렬화 실패", e);
                    }
                })
                .collect(Collectors.toList());
    }

    private void broadcast(String userId, String todoId, Object state, long serverTimeMs) {
        try {
            // SSE payload를 JSON 문자열로 만든다
            String json = objectMapper.writeValueAsString(
                    new TimerStateResponse(todoId, state, serverTimeMs)
            );

            // SSE event 생성
            SseEmitter.SseEventBuilder event = SseEmitter.event()
                    .name("timer-state")
                    .data(json);

            // 해당 user의 모든 SSE 연결에 브로드캐스트
            sseEmitterRegistry.broadcast(userId, event);
        } catch (JacksonException e) {
            // 브로드캐스트 실패: 클라이언트는 GET /api/timer/state 로 보정 가능
        }
    }

}
