package kr.io.flowmate.timer.sse;

import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import tools.jackson.databind.ObjectMapper;

import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SseLocalDispatcherTest {

    @Mock
    private SseEmitterRegistry sseEmitterRegistry;

    @Mock
    private RedisMessageListenerContainer messageListenerContainer;

    private ExecutorService dispatchExecutor;
    private JacksonJsonRedisSerializer<TimerStateChangedEvent> serializer;
    private SseLocalDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        ObjectMapper objectMapper = new ObjectMapper();
        serializer = new JacksonJsonRedisSerializer<>(objectMapper, TimerStateChangedEvent.class);
        dispatchExecutor = Executors.newFixedThreadPool(2);
        dispatcher = new SseLocalDispatcher(
                sseEmitterRegistry, dispatchExecutor, serializer, objectMapper, messageListenerContainer
        );
    }

    @AfterEach
    void tearDown() {
        dispatchExecutor.shutdownNow();
    }

    @Test
    void 느린_broadcast가_진행_중이어도_onMessage는_즉시_반환() throws Exception {
        CountDownLatch broadcastStarted = new CountDownLatch(1);
        CountDownLatch releaseBroadcast = new CountDownLatch(1);
        ExecutorService caller = Executors.newSingleThreadExecutor();

        doAnswer(invocation -> {
            broadcastStarted.countDown();
            releaseBroadcast.await(2, TimeUnit.SECONDS);
            return null;
        }).when(sseEmitterRegistry).broadcast(any(), any());

        try {
            Future<?> onMessageCall = caller.submit(() -> dispatcher.onMessage(messageOf("slow"), null));
            assertThat(broadcastStarted.await(1, TimeUnit.SECONDS)).isTrue();

            assertThatCode(() -> onMessageCall.get(200, TimeUnit.MILLISECONDS))
                    .doesNotThrowAnyException();
        } finally {
            releaseBroadcast.countDown();
            caller.shutdownNow();
        }
    }

    private Message messageOf(String userId) {
        TimerStateChangedEvent event = TimerStateChangedEvent.of(userId, "todo-1", 1L, "{}");
        Message message = mock(Message.class);
        when(message.getBody()).thenReturn(serializer.serialize(event));
        return message;
    }
}