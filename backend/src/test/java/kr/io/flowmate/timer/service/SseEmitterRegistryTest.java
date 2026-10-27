package kr.io.flowmate.timer.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.timer.sse.SseMetrics;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiFunction;

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
    private SimpleMeterRegistry meterRegistry;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        registry = new SseEmitterRegistry(meterRegistry);
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

        // 한 연결의 전송 실패가 같은 사용자의 나머지 연결 전송과 fan-out 작업을 끊지 않도록 예외는 안쪽에서 흡수되어야 한다
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

    @Test
    @DisplayName("broadcast: 연결마다 전송 성공과 실패를 따로 센다")
    void broadcast_countsSuccessAndFailurePerEmitter() throws Exception {
        SseEmitter healthy = mock(SseEmitter.class);
        SseEmitter broken = mock(SseEmitter.class);
        doThrow(new IOException("broken pipe")).when(broken).send(any(SseEmitter.SseEventBuilder.class));
        injectEmitter("user-mixed", healthy);
        injectEmitter("user-mixed", broken);

        registry.broadcast("user-mixed", SseEmitter.event().name("timer-state").data("{}"));

        assertThat(fanOutCount(SseMetrics.SUCCESS)).isEqualTo(1);
        assertThat(fanOutCount(SseMetrics.FAILURE)).isEqualTo(1);
    }

    @Test
    @DisplayName("connections gauge: 이 서버가 들고 있는 연결 수를 사용자 구분 없이 합쳐 보여 준다")
    void connectionsGauge_sumsAllUsers() {
        registry.register("user-a");
        registry.register("user-a");
        registry.register("user-b");

        assertThat(meterRegistry.get(SseMetrics.CONNECTIONS).gauge().value()).isEqualTo(3);
    }

    @Test
    @DisplayName("removeEntry: 마지막 연결을 지우는 순간 같은 사용자가 새로 연결해도 새 연결이 맵에서 빠지지 않는다")
    void removeLastEntry_whileSameUserRegisters_keepsNewConnection() throws Exception {
        registry.register("user-race");
        String firstId = internalIdsOf("user-race").get(0);

        // 다른 스레드의 register 가 removeEntry 의 맵 정리 직전에 끼어든 상황을 결정적으로 재현한다.
        InterleavingMap map = replaceConnectionsWithInterleavingMap();
        map.beforeRemoval = () -> registry.register("user-race");

        invokeRemoveEntry("user-race", firstId);

        List<String> remaining = internalIdsOf("user-race");
        assertThat(remaining).hasSize(1);
        assertThat(remaining.get(0)).isNotEqualTo(firstId);
    }

    private double fanOutCount(String result) {
        return meterRegistry.get(SseMetrics.FANOUT).tag(SseMetrics.RESULT, result).counter().count();
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

    @SuppressWarnings("unchecked")
    private ConcurrentHashMap<String, CopyOnWriteArrayList<Object>> connections() throws Exception {
        Field field = SseEmitterRegistry.class.getDeclaredField("connections");
        field.setAccessible(true);
        return (ConcurrentHashMap<String, CopyOnWriteArrayList<Object>>) field.get(registry);
    }

    private InterleavingMap replaceConnectionsWithInterleavingMap() throws Exception {
        InterleavingMap map = new InterleavingMap();
        map.putAll(connections());
        Field field = SseEmitterRegistry.class.getDeclaredField("connections");
        field.setAccessible(true);
        field.set(registry, map);
        return map;
    }

    private List<String> internalIdsOf(String userId) throws Exception {
        CopyOnWriteArrayList<Object> entries = connections().get(userId);
        if (entries == null) return List.of();
        Method internalId = Class.forName("kr.io.flowmate.timer.service.SseEmitterRegistry$ConnectionEntry")
                .getDeclaredMethod("internalId");
        internalId.setAccessible(true);
        List<String> ids = new ArrayList<>();
        for (Object entry : entries) {
            ids.add((String) internalId.invoke(entry));
        }
        return ids;
    }

    private void invokeRemoveEntry(String userId, String internalId) throws Exception {
        Method removeEntry = SseEmitterRegistry.class.getDeclaredMethod("removeEntry", String.class, String.class);
        removeEntry.setAccessible(true);
        removeEntry.invoke(registry, userId, internalId);
    }

    // 맵에서 사용자 키를 정리하는 연산 직전에 한 번 끼어들 수 있는 맵.
    // 기존 구현의 remove(key, value) 와 원자화한 구현의 computeIfPresent 양쪽에 같은 지점을 건다.
    private static final class InterleavingMap extends ConcurrentHashMap<String, CopyOnWriteArrayList<Object>> {
        private Runnable beforeRemoval;

        private void runOnce() {
            Runnable hook = beforeRemoval;
            beforeRemoval = null;
            if (hook != null) hook.run();
        }

        @Override
        public boolean remove(Object key, Object value) {
            runOnce();
            return super.remove(key, value);
        }

        @Override
        public CopyOnWriteArrayList<Object> computeIfPresent(
                String key,
                BiFunction<? super String, ? super CopyOnWriteArrayList<Object>, ? extends CopyOnWriteArrayList<Object>> remappingFunction
        ) {
            runOnce();
            return super.computeIfPresent(key, remappingFunction);
        }
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
