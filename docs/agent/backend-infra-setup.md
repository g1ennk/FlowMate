# Backend Infrastructure Setup Guide

> 이 가이드를 따라 FlowMate 백엔드 인프라를 단계별로 셋업합니다.
> 각 단계 완료 후 체크박스에 표시하세요.

## 사전 조건

- [ ] JDK 21 설치 확인: `java -version`
- [ ] Gradle 설치 확인: `./gradlew --version`
- [ ] IDE에서 backend 폴더 열기

---

## Step 1: build.gradle 의존성 추가

**파일**: `backend/build.gradle`

현재 의존성에 Flyway를 추가합니다.

```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '4.0.2'
    id 'io.spring.dependency-management' version '1.1.7'
}

group = 'kr.io.flowmate'
version = '0.0.1-SNAPSHOT'
description = 'backend'

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

configurations {
    compileOnly {
        extendsFrom annotationProcessor
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Web
    implementation 'org.springframework.boot:spring-boot-starter-webmvc'

    // Database
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-h2console'

    // Flyway
    implementation 'org.flywaydb:flyway-core'
    implementation 'org.flywaydb:flyway-mysql'

    // Validation
    implementation 'org.springframework.boot:spring-boot-starter-validation'

    // Lombok
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'

    // Database Drivers
    runtimeOnly 'com.h2database:h2'
    runtimeOnly 'com.mysql:mysql-connector-j'

    // Test
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testRuntimeOnly 'org.junit.platform:junit-platform-launcher'
}

tasks.named('test') {
    useJUnitPlatform()
}
```

### 확인
- [ ] `./gradlew dependencies` 실행하여 의존성 확인

---

## Step 2: application.yml 설정

**파일**: `backend/src/main/resources/application.yml`

기존 `application.properties`를 삭제하고 `application.yml`을 생성합니다.

```yaml
# ===========================================
# 공통 설정
# ===========================================
spring:
  application:
    name: flowmate-backend

  # 기본 프로파일
  profiles:
    active: local

  # Jackson (JSON)
  jackson:
    property-naming-strategy: LOWER_CAMEL_CASE
    default-property-inclusion: non_null
    serialization:
      write-dates-as-timestamps: false
    deserialization:
      fail-on-unknown-properties: false

# 서버 설정
server:
  port: 8080
  servlet:
    context-path: /

---
# ===========================================
# Local Profile (H2)
# ===========================================
spring:
  config:
    activate:
      on-profile: local

  # H2 Database
  datasource:
    url: jdbc:h2:mem:flowmate;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;MODE=MySQL
    driver-class-name: org.h2.Driver
    username: sa
    password:

  # H2 Console
  h2:
    console:
      enabled: true
      path: /h2-console
      settings:
        web-allow-others: false

  # JPA
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.H2Dialect

  # Flyway
  flyway:
    enabled: true
    baseline-on-migrate: true
    locations: classpath:db/migration

# 로깅
logging:
  level:
    kr.io.flowmate: DEBUG
    org.springframework.web: DEBUG
    org.hibernate.SQL: DEBUG
    org.hibernate.orm.jdbc.bind: TRACE

---
# ===========================================
# Dev Profile (MySQL)
# ===========================================
spring:
  config:
    activate:
      on-profile: dev

  # MySQL Database
  datasource:
    url: jdbc:mysql://localhost:3306/flowmate?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Seoul&characterEncoding=UTF-8
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: ${DB_USERNAME:flowmate}
    password: ${DB_PASSWORD:flowmate}

  # JPA
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: true
    properties:
      hibernate:
        format_sql: true
        dialect: org.hibernate.dialect.MySQLDialect

  # Flyway
  flyway:
    enabled: true
    baseline-on-migrate: true
    locations: classpath:db/migration

# 로깅
logging:
  level:
    kr.io.flowmate: DEBUG
    org.springframework.web: INFO

---
# ===========================================
# Prod Profile (MySQL)
# ===========================================
spring:
  config:
    activate:
      on-profile: prod

  # MySQL Database
  datasource:
    url: ${DB_URL}
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: ${DB_USERNAME}
    password: ${DB_PASSWORD}

  # JPA
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false

  # Flyway
  flyway:
    enabled: true
    baseline-on-migrate: false
    locations: classpath:db/migration

# 로깅
logging:
  level:
    kr.io.flowmate: INFO
    org.springframework.web: WARN
```

### 확인
- [ ] 기존 `application.properties` 삭제
- [ ] `application.yml` 생성 완료

---

## Step 3: Flyway 마이그레이션 SQL

**폴더 생성**: `backend/src/main/resources/db/migration/`

**파일**: `V1__init.sql`

```sql
-- ===========================================
-- FlowMate Database Schema
-- Version: 1
-- ===========================================

-- -------------------------------------------
-- Table: todos
-- -------------------------------------------
CREATE TABLE todos (
    id                    VARCHAR(36)  NOT NULL,
    user_id               VARCHAR(255) NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    note                  TEXT,
    date                  DATE         NOT NULL,
    mini_day              TINYINT      NOT NULL DEFAULT 0,
    day_order             INT          NOT NULL DEFAULT 0,
    is_done               BOOLEAN      NOT NULL DEFAULT FALSE,
    session_count         INT          NOT NULL DEFAULT 0,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    timer_mode            VARCHAR(20),
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
);

-- 사용자/날짜별 Todo 조회 (핫패스)
CREATE INDEX idx_todos_user_date ON todos (user_id, date);

-- 섹션/완료상태/정렬 조회
CREATE INDEX idx_todos_user_dayorder ON todos (user_id, date, is_done, mini_day, day_order);


-- -------------------------------------------
-- Table: todo_sessions
-- -------------------------------------------
CREATE TABLE todo_sessions (
    id                    VARCHAR(36)  NOT NULL,
    todo_id               VARCHAR(36)  NOT NULL,
    user_id               VARCHAR(255) NOT NULL,
    session_focus_seconds INT          NOT NULL DEFAULT 0,
    break_seconds         INT          NOT NULL DEFAULT 0,
    session_order         INT          NOT NULL,
    created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
);

-- Todo별 세션 조회/삭제
CREATE INDEX idx_sessions_todo ON todo_sessions (todo_id);

-- 사용자 단위 분석
CREATE INDEX idx_sessions_user ON todo_sessions (user_id);


-- -------------------------------------------
-- Table: user_settings
-- -------------------------------------------
CREATE TABLE user_settings (
    user_id            VARCHAR(255) NOT NULL,

    -- Pomodoro Session
    flow_min           INT          NOT NULL DEFAULT 25,
    break_min          INT          NOT NULL DEFAULT 5,
    long_break_min     INT          NOT NULL DEFAULT 15,
    cycle_every        INT          NOT NULL DEFAULT 4,

    -- Automation
    auto_start_break   BOOLEAN      NOT NULL DEFAULT FALSE,
    auto_start_session BOOLEAN      NOT NULL DEFAULT FALSE,

    -- MiniDays (분 단위 저장)
    day1_label         VARCHAR(50)  NOT NULL DEFAULT '오전',
    day1_start_min     SMALLINT     NOT NULL DEFAULT 360,
    day1_end_min       SMALLINT     NOT NULL DEFAULT 720,

    day2_label         VARCHAR(50)  NOT NULL DEFAULT '오후',
    day2_start_min     SMALLINT     NOT NULL DEFAULT 720,
    day2_end_min       SMALLINT     NOT NULL DEFAULT 1080,

    day3_label         VARCHAR(50)  NOT NULL DEFAULT '저녁',
    day3_start_min     SMALLINT     NOT NULL DEFAULT 1080,
    day3_end_min       SMALLINT     NOT NULL DEFAULT 1440,

    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id)
);


-- -------------------------------------------
-- Table: reviews
-- -------------------------------------------
CREATE TABLE reviews (
    id           VARCHAR(36)  NOT NULL,
    user_id      VARCHAR(255) NOT NULL,
    type         VARCHAR(20)  NOT NULL,
    period_start DATE         NOT NULL,
    period_end   DATE         NOT NULL,
    content      TEXT         NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
);

-- 기간별 회고 1건 보장 (upsert 충돌 키)
CREATE UNIQUE INDEX uniq_reviews_user_period ON reviews (user_id, type, period_start);

-- 사용자/기간 범위 조회
CREATE INDEX idx_reviews_user_period ON reviews (user_id, period_start);
```

### 확인
- [ ] `db/migration` 폴더 생성
- [ ] `V1__init.sql` 파일 생성
- [ ] SQL 문법 확인 (H2 MODE=MySQL 호환)

---

## Step 4: 패키지 구조 생성

다음 폴더들을 생성합니다:

```
backend/src/main/java/kr/io/flowmate/backend/
├── config/
├── common/
│   ├── error/
│   └── util/
├── todo/
│   ├── domain/
│   ├── dto/
│   ├── repo/
│   ├── service/
│   └── web/
├── session/
│   ├── domain/
│   ├── dto/
│   ├── repo/
│   ├── service/
│   └── web/
├── settings/
│   ├── domain/
│   ├── dto/
│   ├── repo/
│   ├── service/
│   └── web/
└── review/
    ├── domain/
    ├── dto/
    ├── repo/
    ├── service/
    └── web/
```

### 확인
- [ ] 모든 패키지 폴더 생성 완료

---

## Step 5: CORS 설정

**파일**: `backend/src/main/java/kr/io/flowmate/backend/config/CorsConfig.java`

```java
package kr.io.flowmate.backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(
                        "http://localhost:5173",  // Vite dev server
                        "http://localhost:4173"   // Vite preview
                )
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .exposedHeaders("X-Client-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}
```

### 확인
- [ ] `CorsConfig.java` 생성 완료

---

## Step 6: 에러 처리

### 6.1 ApiError (에러 응답 DTO)

**파일**: `backend/src/main/java/kr/io/flowmate/backend/common/error/ApiError.java`

```java
package kr.io.flowmate.backend.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Getter;

import java.util.Map;

@Getter
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiError {
    private final String code;
    private final String message;
    private final Map<String, String> fields;

    public static ApiError of(String code, String message) {
        return ApiError.builder()
                .code(code)
                .message(message)
                .build();
    }

    public static ApiError of(String code, String message, Map<String, String> fields) {
        return ApiError.builder()
                .code(code)
                .message(message)
                .fields(fields)
                .build();
    }
}
```

### 6.2 ApiErrorResponse (에러 응답 래퍼)

**파일**: `backend/src/main/java/kr/io/flowmate/backend/common/error/ApiErrorResponse.java`

```java
package kr.io.flowmate.backend.common.error;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public class ApiErrorResponse {
    private final ApiError error;

    public static ApiErrorResponse of(ApiError error) {
        return new ApiErrorResponse(error);
    }

    public static ApiErrorResponse of(String code, String message) {
        return new ApiErrorResponse(ApiError.of(code, message));
    }
}
```

### 6.3 NotFoundException

**파일**: `backend/src/main/java/kr/io/flowmate/backend/common/error/NotFoundException.java`

```java
package kr.io.flowmate.backend.common.error;

public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }

    public NotFoundException(String resourceName, String id) {
        super(resourceName + " not found: " + id);
    }
}
```

### 6.4 GlobalExceptionHandler

**파일**: `backend/src/main/java/kr/io/flowmate/backend/common/error/GlobalExceptionHandler.java`

```java
package kr.io.flowmate.backend.common.error;

import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 400 - Validation Error (RequestBody)
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidationException(MethodArgumentNotValidException ex) {
        Map<String, String> fields = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            fields.put(fieldError.getField(), fieldError.getDefaultMessage());
        }

        log.warn("Validation error: {}", fields);

        ApiError error = ApiError.of("VALIDATION_ERROR", "Validation failed", fields);
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(error));
    }

    // 400 - Validation Error (PathVariable, RequestParam)
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(ConstraintViolationException ex) {
        Map<String, String> fields = new HashMap<>();
        ex.getConstraintViolations().forEach(violation -> {
            String path = violation.getPropertyPath().toString();
            String field = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1) : path;
            fields.put(field, violation.getMessage());
        });

        log.warn("Constraint violation: {}", fields);

        ApiError error = ApiError.of("VALIDATION_ERROR", "Validation failed", fields);
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(error));
    }

    // 400 - JSON Parse Error
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiErrorResponse> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        log.warn("JSON parse error: {}", ex.getMessage());

        ApiError error = ApiError.of("INVALID_REQUEST", "Invalid JSON format");
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(error));
    }

    // 400 - Missing Header
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingHeader(MissingRequestHeaderException ex) {
        log.warn("Missing header: {}", ex.getHeaderName());

        ApiError error = ApiError.of("MISSING_HEADER", "Required header missing: " + ex.getHeaderName());
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(error));
    }

    // 400 - Illegal Argument
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Illegal argument: {}", ex.getMessage());

        ApiError error = ApiError.of("INVALID_REQUEST", ex.getMessage());
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(error));
    }

    // 404 - Not Found
    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(NotFoundException ex) {
        log.warn("Not found: {}", ex.getMessage());

        ApiError error = ApiError.of("NOT_FOUND", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiErrorResponse.of(error));
    }

    // 500 - Internal Server Error
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleGenericException(Exception ex) {
        log.error("Unexpected error", ex);

        ApiError error = ApiError.of("INTERNAL_ERROR", "An unexpected error occurred");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(ApiErrorResponse.of(error));
    }
}
```

### 확인
- [ ] `ApiError.java` 생성
- [ ] `ApiErrorResponse.java` 생성
- [ ] `NotFoundException.java` 생성
- [ ] `GlobalExceptionHandler.java` 생성

---

## Step 7: Client ID Resolver

**파일**: `backend/src/main/java/kr/io/flowmate/backend/common/util/ClientIdResolver.java`

```java
package kr.io.flowmate.backend.common.util;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class ClientIdResolver {

    private static final String HEADER_NAME = "X-Client-Id";

    /**
     * HTTP 요청에서 X-Client-Id 헤더를 추출합니다.
     *
     * @param request HTTP 요청
     * @return Client ID
     * @throws IllegalArgumentException X-Client-Id 헤더가 없거나 빈 값인 경우
     */
    public String resolve(HttpServletRequest request) {
        String clientId = request.getHeader(HEADER_NAME);
        if (clientId == null || clientId.isBlank()) {
            throw new IllegalArgumentException("X-Client-Id header is required");
        }
        return clientId.trim();
    }

    /**
     * Client ID 유효성 검증 (UUID 형식 권장, 현재는 비어있지 않은지만 확인)
     */
    public boolean isValid(String clientId) {
        return clientId != null && !clientId.isBlank();
    }
}
```

### 확인
- [ ] `ClientIdResolver.java` 생성

---

## Step 8: Health Check 엔드포인트 (선택)

**파일**: `backend/src/main/java/kr/io/flowmate/backend/config/HealthController.java`

```java
package kr.io.flowmate.backend.config;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "timestamp", Instant.now().toString()
        ));
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> apiHealth() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "timestamp", Instant.now().toString()
        ));
    }
}
```

### 확인
- [ ] `HealthController.java` 생성 (선택사항)

---

## Step 9: 애플리케이션 부팅 테스트

### 9.1 빌드

```bash
cd backend
./gradlew clean build -x test
```

### 9.2 실행

```bash
./gradlew bootRun
```

또는

```bash
java -jar build/libs/backend-0.0.1-SNAPSHOT.jar
```

### 9.3 확인 포인트

1. **콘솔 로그 확인**
   - Flyway 마이그레이션 성공 로그
   - `Started BackendApplication` 메시지

2. **H2 Console 접속**
   - URL: http://localhost:8080/h2-console
   - JDBC URL: `jdbc:h2:mem:flowmate`
   - User: `sa`
   - Password: (비움)
   - 테이블 4개 확인: `todos`, `todo_sessions`, `user_settings`, `reviews`

3. **Health Check**
   ```bash
   curl http://localhost:8080/health
   ```

   응답:
   ```json
   {"status":"UP","timestamp":"2026-02-05T..."}
   ```

4. **CORS 확인** (프론트엔드에서)
   ```bash
   curl -i -X OPTIONS http://localhost:8080/api/health \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: GET"
   ```

   `Access-Control-Allow-Origin: http://localhost:5173` 헤더 확인

### 확인
- [ ] 빌드 성공
- [ ] 애플리케이션 부팅 성공
- [ ] Flyway 마이그레이션 성공 (테이블 4개 생성)
- [ ] H2 Console 접속 가능
- [ ] Health Check 응답 정상

---

## 최종 파일 구조

```
backend/
├── build.gradle
├── settings.gradle
└── src/
    └── main/
        ├── java/kr/io/flowmate/backend/
        │   ├── BackendApplication.java
        │   ├── config/
        │   │   ├── CorsConfig.java
        │   │   └── HealthController.java
        │   └── common/
        │       ├── error/
        │       │   ├── ApiError.java
        │       │   ├── ApiErrorResponse.java
        │       │   ├── NotFoundException.java
        │       │   └── GlobalExceptionHandler.java
        │       └── util/
        │           └── ClientIdResolver.java
        └── resources/
            ├── application.yml
            └── db/
                └── migration/
                    └── V1__init.sql
```

---

## 체크리스트 요약

- [ ] Step 1: build.gradle 의존성
- [ ] Step 2: application.yml 설정
- [ ] Step 3: Flyway 마이그레이션 SQL
- [ ] Step 4: 패키지 구조 생성
- [ ] Step 5: CORS 설정
- [ ] Step 6: 에러 처리 클래스들
- [ ] Step 7: ClientIdResolver
- [ ] Step 8: Health Check (선택)
- [ ] Step 9: 부팅 테스트 성공

---

## 다음 단계

인프라 셋업 완료 후:
1. **Todo 도메인** 구현 (Entity → Repository → Service → Controller)
2. **Session 도메인** 구현
3. **Settings 도메인** 구현
4. **Review 도메인** 구현
5. 프론트엔드 연동 테스트
