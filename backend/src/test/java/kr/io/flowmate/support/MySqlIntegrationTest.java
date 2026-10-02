package kr.io.flowmate.support;

import com.redis.testcontainers.RedisContainer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

/**
 * 실제 MySQL 8.0 + Redis에서 도는 통합 테스트의 공통 설정.
 * H2로는 InnoDB의 PK 충돌·gap lock·MVCC 스냅샷 동작을 재현할 수 없다.
 * 컨테이너는 JVM당 한 번만 띄운다. Spring 컨텍스트는 하위 클래스의 Bean override 조합별로 캐시되므로,
 * 같은 도메인의 IT는 공통 하위 클래스(예: TimerIntegrationTest)에서 override를 한 번만 선언한다.
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class MySqlIntegrationTest {

    static final MySQLContainer<?> MYSQL = new MySQLContainer<>(DockerImageName.parse("mysql:8.0"));
    static final RedisContainer REDIS = new RedisContainer(DockerImageName.parse("redis:7-alpine"));

    static {
        MYSQL.start();
        REDIS.start();
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        // 운영과 같은 Connector/J 시간대 설정으로 Instant 왕복을 검증한다
        registry.add("spring.datasource.url", () -> withServerTimezone(MYSQL.getJdbcUrl()));
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
        // 스키마는 Flyway만 만든다. test 소스의 감사 검증용 엔티티 때문에 validate는 쓸 수 없다
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.jpa.properties.hibernate.dialect", () -> "org.hibernate.dialect.MySQLDialect");
        registry.add("spring.flyway.enabled", () -> "true");
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    private static String withServerTimezone(String jdbcUrl) {
        return jdbcUrl + (jdbcUrl.contains("?") ? "&" : "?") + "serverTimezone=Asia/Seoul";
    }

    /** performance_schema처럼 테스트 사용자 권한 밖의 진단 테이블을 읽을 때만 쓴다. */
    protected static Connection openRootConnection() throws SQLException {
        return DriverManager.getConnection(MYSQL.getJdbcUrl(), "root", MYSQL.getPassword());
    }
}
