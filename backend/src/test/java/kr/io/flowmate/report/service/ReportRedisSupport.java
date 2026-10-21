package kr.io.flowmate.report.service;

import com.redis.testcontainers.RedisContainer;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.time.Duration;

/** 리포트 보호 장치 테스트용 Redis. 컨테이너는 JVM당 한 번만 띄운다 */
final class ReportRedisSupport {

    static final RedisContainer REDIS = new RedisContainer(DockerImageName.parse("redis:7-alpine"));

    static {
        REDIS.start();
    }

    private ReportRedisSupport() {
    }

    /** 실제 Redis 컨테이너에 붙은 template */
    static Connected connect() {
        return open(REDIS.getHost(), REDIS.getMappedPort(6379));
    }

    /** 아무도 listen하지 않는 포트에 붙은 template. 모든 명령이 연결 실패로 끝난다 */
    static Connected unreachable() {
        int port;
        try (ServerSocket socket = new ServerSocket(0)) {
            port = socket.getLocalPort();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return open("127.0.0.1", port);
    }

    private static Connected open(String host, int port) {
        LettuceClientConfiguration client = LettuceClientConfiguration.builder()
            .commandTimeout(Duration.ofSeconds(2))
            .build();
        LettuceConnectionFactory factory = new LettuceConnectionFactory(new RedisStandaloneConfiguration(host, port), client);
        factory.afterPropertiesSet();
        factory.start();
        return new Connected(factory, new StringRedisTemplate(factory));
    }

    record Connected(LettuceConnectionFactory factory, StringRedisTemplate template) implements AutoCloseable {
        void flush() {
            template.execute((org.springframework.data.redis.core.RedisCallback<Object>) connection -> {
                connection.serverCommands().flushAll();
                return null;
            });
        }

        @Override
        public void close() {
            factory.destroy();
        }
    }
}
