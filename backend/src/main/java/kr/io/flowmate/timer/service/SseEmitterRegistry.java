package kr.io.flowmate.timer.service;

import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

@Component
public class SseEmitterRegistry {

    private static final long SSE_TIMEOUT_MS = TimeUnit.HOURS.toMillis(1);
    private static final long HEARTBEAT_INTERVAL_MS = TimeUnit.SECONDS.toMillis(25);

    private record ConnectionEntry(String internalId, SseEmitter emitter, ScheduledFuture<?> heartbeatTask) {
    }

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<ConnectionEntry>> connections =
            new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor(
            new HeartbeatThreadFactory()
    );

    public SseEmitter register(String userId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        String internalId = UUID.randomUUID().toString();

        ScheduledFuture<?> heartbeatTask = heartbeatExecutor.scheduleAtFixedRate(
                () -> sendHeartbeat(userId, internalId),
                HEARTBEAT_INTERVAL_MS,
                HEARTBEAT_INTERVAL_MS,
                TimeUnit.MILLISECONDS
        );
        ConnectionEntry entry = new ConnectionEntry(internalId, emitter, heartbeatTask);

        // 해당 userId의 연결 목록이 없으면 새로 만들고, 있으면 거기에 추가한다.
        connections.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(entry);

        // 정상 종료 시, timeout 종료 시, 전송 중 예외 발생 시 정리
        emitter.onCompletion(() -> removeEntry(userId, internalId));
        emitter.onTimeout(() -> removeEntry(userId, internalId));
        emitter.onError(e -> removeEntry(userId, internalId));

        try {
            emitter.send(SseEmitter.event()
                    .name("connected")
                    .data("ok"));
        } catch (Exception e) {
            if (isDisconnectedClientError(e)) {
                removeEntry(userId, internalId);
                return emitter;
            }
            throw new IllegalStateException("SSE 초기 연결 이벤트 전송 실패", e);
        }

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
            } catch (Exception e) {
                if (isDisconnectedClientError(e)) {
                    removeEntry(userId, entry.internalId());
                    continue;
                }
                throw new IllegalStateException("SSE 브로드캐스트 전송 실패", e);
            }
        }
    }

    private void removeEntry(String userId, String internalId) {
        // 해당 유저의 모든 연결을 가져오고 연결이 없으면 보낼 대상이 없기 때문에 바로 종료
        CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
        if (entries == null) return;

        // 해당 internalId를 가진 연결만 제거
        entries.removeIf(entry -> {
            if (!entry.internalId().equals(internalId)) {
                return false;
            }
            entry.heartbeatTask().cancel(true);
            return true;
        });

        // 연결이 아예 없으면 map도 제거
        if (entries.isEmpty()) {
            connections.remove(userId, entries);
        }
    }

    private void sendHeartbeat(String userId, String internalId) {
        ConnectionEntry entry = findEntry(userId, internalId);
        if (entry == null) return;

        try {
            entry.emitter().send(SseEmitter.event()
                    .name("heartbeat")
                    .data("keepalive"));
        } catch (Exception e) {
            if (isDisconnectedClientError(e)) {
                removeEntry(userId, internalId);
                return;
            }
            throw new IllegalStateException("SSE heartbeat 전송 실패", e);
        }
    }

    private ConnectionEntry findEntry(String userId, String internalId) {
        CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
        if (entries == null) return null;

        for (ConnectionEntry entry : entries) {
            if (entry.internalId().equals(internalId)) {
                return entry;
            }
        }
        return null;
    }

    @PreDestroy
    void shutdown() {
        heartbeatExecutor.shutdownNow();
    }

    private boolean isDisconnectedClientError(Throwable error) {
        return error instanceof IOException
                || error instanceof IllegalStateException
                || error instanceof AsyncRequestNotUsableException;
    }

    private static final class HeartbeatThreadFactory implements ThreadFactory {

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "sse-heartbeat");
            thread.setDaemon(true);
            return thread;
        }
    }
}
