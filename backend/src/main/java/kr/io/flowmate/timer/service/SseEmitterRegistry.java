package kr.io.flowmate.timer.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
public class SseEmitterRegistry {

    private static final long SSE_TIMEOUT_MS = TimeUnit.HOURS.toMillis(1); // 1시간
    private static final long HEARTBEAT_INTERVAL_MS = TimeUnit.SECONDS.toMillis(25); // 25초

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

        // 목록 추가를 compute 안에서 해야 removeEntry 의 빈 목록 정리와 겹치지 않는다.
        // (computeIfAbsent 로 꺼낸 뒤 add 하면 그 사이 목록이 맵에서 빠져 새 연결이 고아가 될 수 있다)
        connections.compute(userId, (key, entries) -> {
            CopyOnWriteArrayList<ConnectionEntry> list = entries != null ? entries : new CopyOnWriteArrayList<>();
            list.add(entry);
            return list;
        });

        emitter.onCompletion(() -> removeEntry(userId, internalId));
        emitter.onTimeout(() -> removeEntry(userId, internalId));
        emitter.onError(e -> removeEntry(userId, internalId));

        try {
            emitter.send(SseEmitter.event().name("connected").data("ok"));
        } catch (Exception e) {
            // 초기 connected 이벤트 전송 실패 시 heartbeatTask/entry 를 즉시 정리해 누수를 막는다.
            log.warn("SSE 초기 이벤트 전송 실패, 연결 정리. userId={}", userId, e);
            removeEntry(userId, internalId);
        }

        return emitter;
    }

    // broadcast 는 fire-and-forget.
    // Redis 구독 후 sseDispatchExecutor 의 비동기 fan-out(SseLocalDispatcher)에서 호출되므로
    // DB 정본은 이미 커밋된 상태다. 전송 실패가 같은 사용자의 나머지 emitter 전송을
    // 끊지 않도록 어떤 예외든 삼키고 dead connection 만 정리한다.
    public void broadcast(String userId, SseEmitter.SseEventBuilder event) {
        CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
        if (entries == null) return;

        for (ConnectionEntry entry : entries) {
            try {
                entry.emitter().send(event);
            } catch (Exception e) {
                log.warn("SSE 브로드캐스트 전송 실패, 연결 정리. userId={}", userId, e);
                removeEntry(userId, entry.internalId());
            }
        }
    }

    // 엔트리 제거와 빈 목록 정리를 한 번의 원자 연산으로 처리한다.
    // isEmpty 확인 뒤 remove 를 따로 하면 그 사이 register 가 같은 목록에 추가한 새 연결까지 맵에서 빠져
    // broadcast 를 못 받고 heartbeat task 도 취소되지 않은 채 남는다.
    private void removeEntry(String userId, String internalId) {
        connections.computeIfPresent(userId, (key, entries) -> {
            entries.removeIf(entry -> {
                if (!entry.internalId().equals(internalId)) {
                    return false;
                }
                entry.heartbeatTask().cancel(true);
                return true;
            });
            return entries.isEmpty() ? null : entries;
        });
    }

    // heartbeat 실패는 해당 연결만 정리하고 executor task 는 계속 살려둔다.
    // 예외를 throw 하면 scheduleAtFixedRate 가 향후 실행을 중단해 전체 heartbeat 가 멈춘다.
    private void sendHeartbeat(String userId, String internalId) {
        ConnectionEntry entry = findEntry(userId, internalId);
        if (entry == null) return;

        try {
            entry.emitter().send(SseEmitter.event().name("heartbeat").data("keepalive"));
        } catch (Exception e) {
            log.debug("SSE heartbeat 전송 실패, 연결 정리. userId={}", userId, e);
            removeEntry(userId, internalId);
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

    private static final class HeartbeatThreadFactory implements ThreadFactory {

        @Override
        public Thread newThread(Runnable runnable) {
            Thread thread = new Thread(runnable, "sse-heartbeat");
            thread.setDaemon(true);
            return thread;
        }
    }
}
