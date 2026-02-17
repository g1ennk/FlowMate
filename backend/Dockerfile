# Multi-stage 빌드: Spring Boot Backend
# Stage 1에서 빌드, Stage 2에서 실행 (이미지 크기 최적화)

# ============================================
# Stage 1: 빌드
# ============================================
FROM gradle:8.14-jdk21 AS builder

WORKDIR /app

# Gradle 설정 파일 복사 (의존성 캐싱)
COPY build.gradle settings.gradle ./
COPY gradle ./gradle

# 의존성 다운로드
RUN gradle dependencies --no-daemon || true

# 소스 코드 복사
COPY src ./src

# JAR 파일 빌드
RUN gradle bootJar --no-daemon

# ============================================
# Stage 2: 실행
# ============================================
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

# non-root 사용자로 실행 (보안)
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# JAR 파일만 복사
COPY --from=builder /app/build/libs/*.jar app.jar

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
