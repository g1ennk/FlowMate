package kr.io.flowmate.config;

import kr.io.flowmate.timer.event.TimerStateChangedEvent;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;
import org.springframework.scheduling.concurrent.CustomizableThreadFactory;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Configuration
public class RedisConfig {

    @Value("${spring.data.redis.host:localhost}")
    private String redisHost;

    @Value("${spring.data.redis.port:6379}")
    private int redisPort;

    @Value("${spring.data.redis.password:}")
    private String redisPassword;

    @Bean
    @Primary
    public LettuceConnectionFactory redisConnectionFactory() {
        return buildFactory();
    }

    @Bean(name = "subscriberConnectionFactory")
    public LettuceConnectionFactory subscriberConnectionFactory() {
        return buildFactory();
    }

    private LettuceConnectionFactory buildFactory() {
        RedisStandaloneConfiguration standalone = new RedisStandaloneConfiguration(redisHost, redisPort);
        if (redisPassword != null && !redisPassword.isBlank()) {
            standalone.setPassword(redisPassword);
        }
        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofSeconds(2))
                .build();
        return new LettuceConnectionFactory(standalone, client);
    }

    @Bean
    public JacksonJsonRedisSerializer<TimerStateChangedEvent> timerStateChangedEventSerializer(
            ObjectMapper objectMapper
    ) {
        return new JacksonJsonRedisSerializer<>(objectMapper, TimerStateChangedEvent.class);
    }

    @Bean
    public RedisTemplate<String, TimerStateChangedEvent> timerStateChangedEventRedisTemplate(
            RedisConnectionFactory connectionFactory,
            JacksonJsonRedisSerializer<TimerStateChangedEvent> timerSerializer
    ) {
        RedisTemplate<String, TimerStateChangedEvent> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(timerSerializer);
        return template;
    }

    @Bean(name = "sseDispatchExecutor", destroyMethod = "shutdown")
    public ExecutorService sseDispatchExecutor() {
        return new ThreadPoolExecutor(
                4, 8, 60L, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(200),
                new CustomizableThreadFactory("sse-dispatch-"),
                new ThreadPoolExecutor.DiscardOldestPolicy()
        );
    }

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            @Qualifier("subscriberConnectionFactory") RedisConnectionFactory factory
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.setRecoveryInterval(5000L);
        return container;
    }
}
