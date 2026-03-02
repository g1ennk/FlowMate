package kr.io.flowmate.timer.service;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class SseEmitterRegistry {

    private record ConnectionEntry(String internalId, SseEmitter emitter) {
    }

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<ConnectionEntry>> connections =
            new ConcurrentHashMap<>();

    public SseEmitter register(String userId) {
        SseEmitter emitter = new SseEmitter(900_000L);
        String internalId = UUID.randomUUID().toString();
        ConnectionEntry entry = new ConnectionEntry(internalId, emitter);

        // 해당 userId의 연결 목록이 없으면 새로 만들고, 있으면 거기에 추가한다.
        connections.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(entry);

        // 정상 종료 시, timeout 종료 시, 전송 중 예외 발생 시 정리
        emitter.onCompletion(() -> removeEntry(userId, internalId));
        emitter.onTimeout(() -> removeEntry(userId, internalId));
        emitter.onError(e -> removeEntry(userId, internalId));

        return emitter;
    }

    public void broadcast(String userId, SseEmitter.SseEventBuilder event) {
        // 해당 유저의 모든 연결을 가져오고 연결이 없으면 보낼 대상이 없기 때문에 바로 종료
        CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
        if (entries == null) return;

        // 같은 유저의 연결의 동일 이벤트를 보낸다.
        for (ConnectionEntry entry : entries) {
            try {
                entry.emitter().send(event);
            } catch (IOException | IllegalStateException e) {
                removeEntry(userId, entry.internalId());
            }
        }
    }

    private void removeEntry(String userId, String internalId) {
        // 해당 유저의 모든 연결을 가져오고 연결이 없으면 보낼 대상이 없기 때문에 바로 종료
        CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
        if (entries == null) return;

        // 해당 internalId를 가진 연결만 제거
        entries.removeIf(entry -> entry.internalId().equals(internalId));

        // 연결이 아예 없으면 map도 제거
        if (entries.isEmpty()) {
            connections.remove(userId, entries);
        }
    }
}
