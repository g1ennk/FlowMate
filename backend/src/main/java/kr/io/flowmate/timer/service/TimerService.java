package kr.io.flowmate.timer.service;

import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.exception.TodoNotFoundException;
import kr.io.flowmate.todo.repository.TodoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

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

        // idle이면 soft delete
        if ("idle".equals(request.getStatus())) {
            timerState.update(null, newVersion);
        } else {
            // running|paused|waiting 중 하나이면 state를 JSON 문자열로 저장
            try {
                String json = objectMapper.writeValueAsString(request.getState());
                timerState.update(json, newVersion);
            } catch (JacksonException e) {
                throw new IllegalArgumentException("state 직렬화 실패", e);
            }
        }

        // DB 즉시 반영
        timerStateRepository.saveAndFlush(timerState);

        // 응답/SSE에 넣을 state 결정 후, 같은 유저의 모든 기기에 SSE 전송
        Object responseState = "idle".equals(request.getStatus()) ? null : request.getState();
        broadcast(userId, todoId, responseState, newVersion);

        // 클라이언트 응답 반환
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
