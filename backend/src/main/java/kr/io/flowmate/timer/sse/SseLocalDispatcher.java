package kr.io.flowmate.timer.sse;

import jakarta.annotation.PostConstruct;
import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import kr.io.flowmate.timer.service.SseEmitterRegistry;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.concurrent.ExecutorService;

@Slf4j
@Component
public class SseLocalDispatcher implements MessageListener {

    private final SseEmitterRegistry sseEmitterRegistry;
    private final ExecutorService sseDispatchExecutor;
    private final JacksonJsonRedisSerializer<TimerStateChangedEvent> serializer;
    private final ObjectMapper objectMapper;
    private final RedisMessageListenerContainer messageListenerContainer;

    public SseLocalDispatcher(
            SseEmitterRegistry sseEmitterRegistry,
            @Qualifier("sseDispatchExecutor") ExecutorService sseDispatchExecutor,
            JacksonJsonRedisSerializer<TimerStateChangedEvent> serializer,
            ObjectMapper objectMapper,
            RedisMessageListenerContainer messageListenerContainer
    ) {
        this.sseEmitterRegistry = sseEmitterRegistry;
        this.sseDispatchExecutor = sseDispatchExecutor;
        this.serializer = serializer;
        this.objectMapper = objectMapper;
        this.messageListenerContainer = messageListenerContainer;
    }

    @PostConstruct
    void registerListener() {
        messageListenerContainer.addMessageListener(this, new ChannelTopic(SseBroadcaster.CHANNEL));
    }

    @Override
    public void onMessage(Message message, byte @Nullable [] pattern) {
        TimerStateChangedEvent event = serializer.deserialize(message.getBody());
        if (event == null) return;
        sseDispatchExecutor.submit(() -> fanOut(event));
    }

    private void fanOut(TimerStateChangedEvent event) {
        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("todoId", event.todoId());
            payload.put("version", event.version());
            if (event.state() == null) {
                payload.putNull("state");
            } else {
                payload.set("state", objectMapper.readTree(event.state()));
            }
            String json = objectMapper.writeValueAsString(payload);
            SseEmitter.SseEventBuilder eventBuilder = SseEmitter.event()
                    .name("timer-state")
                    .data(json);
            sseEmitterRegistry.broadcast(event.userId(), eventBuilder);
        } catch (JacksonException ex) {
            throw new IllegalStateException("timer-state payload 변환 실패", ex);
        }
    }
}