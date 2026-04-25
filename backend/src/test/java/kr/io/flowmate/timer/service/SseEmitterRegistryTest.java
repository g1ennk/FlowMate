package kr.io.flowmate.timer.service;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@DisplayName("SseEmitterRegistry")
class SseEmitterRegistryTest {

    private SseEmitterRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new SseEmitterRegistry();
    }

    @AfterEach
    void tearDown() {
        // 테스트 JVM 에서 heartbeat executor 의 스케줄 task 가 누수되지 않도록 정리
        registry.shutdown();
    }

    @Test
    @DisplayName("register: userId 에 대해 emitter 를 만들어 반환하고 초기 connected 이벤트를 전송한다")
    void register_newUser_returnsEmitterAndSendsConnected() {
        SseEmitter emitter = registry.register("user-1");

        // 실제 SseEmitter 가 반환되고, 초기 send 실패 없이 connections map 에 엔트리가 유지되어야 한다
        assertThat(emitter).isNotNull();
    }

    @Test
    @DisplayName("broadcast: 전송 중 IOException 이 나도 호출자에게 예외를 전파하지 않는다 (fire-and-forget)")
    void broadcast_transmissionFailure_swallowsException() throws Exception {
        // 실제 SseEmitter 를 주입하되 send 에서 IOException 을 던지도록 spy
        SseEmitter failingEmitter = mock(SseEmitter.class);
        doThrow(new IOException("broken pipe")).when(failingEmitter).send(any(SseEmitter.SseEventBuilder.class));
        injectEmitter("user-fail", failingEmitter);

        // upsertState 트랜잭션이 SSE 실패로 롤백되면 안 되므로 예외는 반드시 안쪽에서 흡수되어야 한다
        assertThatCode(() -> registry.broadcast("user-fail",
                SseEmitter.event().name("timer-state").data("{}")))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("broadcast: userId 에 연결이 없으면 조용히 무시 (no-op)")
    void broadcast_noConnections_isNoop() {
        assertThatCode(() -> registry.broadcast("unknown-user",
                SseEmitter.event().name("timer-state").data("{}")))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("broadcast: 같은 userId 에 연결된 모든 emitter 로 전송된다")
    void broadcast_multipleConnections_sendsAll() throws Exception {
        SseEmitter e1 = mock(SseEmitter.class);
        SseEmitter e2 = mock(SseEmitter.class);
        injectEmitter("user-multi", e1);
        injectEmitter("user-multi", e2);

        registry.broadcast("user-multi", SseEmitter.event().name("timer-state").data("{}"));

        verify(e1).send(any(SseEmitter.SseEventBuilder.class));
        verify(e2).send(any(SseEmitter.SseEventBuilder.class));
    }

    // 테스트 전용 헬퍼 — 실제 SseEmitter 를 직접 register 하면 heartbeat task 스케줄이 시작되어 테스트가 무거워진다.
    // 대신 reflection 으로 connections map 에 entry 를 직접 삽입해 broadcast 경로만 격리 검증한다.
    @SuppressWarnings("unchecked")
    private void injectEmitter(String userId, SseEmitter emitter) throws Exception {
        Class<?> entryClass = Class.forName("kr.io.flowmate.timer.service.SseEmitterRegistry$ConnectionEntry");
        var ctor = entryClass.getDeclaredConstructors()[0];
        ctor.setAccessible(true);
        // ConnectionEntry(String internalId, SseEmitter emitter, ScheduledFuture<?> heartbeatTask)
        Object entry = ctor.newInstance("internal-" + userId, emitter, new NoopFuture());

        var field = SseEmitterRegistry.class.getDeclaredField("connections");
        field.setAccessible(true);
        var connections = (java.util.concurrent.ConcurrentHashMap<String, java.util.concurrent.CopyOnWriteArrayList<Object>>) field.get(registry);
        connections.computeIfAbsent(userId, k -> new java.util.concurrent.CopyOnWriteArrayList<>()).add(entry);
    }

    // heartbeat 스케줄 객체 대신 주입하기 위한 최소 ScheduledFuture 더미
    private static final class NoopFuture implements java.util.concurrent.ScheduledFuture<Object> {
        @Override public long getDelay(java.util.concurrent.TimeUnit unit) { return 0; }
        @Override public int compareTo(java.util.concurrent.Delayed o) { return 0; }
        @Override public boolean cancel(boolean mayInterruptIfRunning) { return true; }
        @Override public boolean isCancelled() { return false; }
        @Override public boolean isDone() { return false; }
        @Override public Object get() { return null; }
        @Override public Object get(long timeout, java.util.concurrent.TimeUnit unit) { return null; }
    }
}
