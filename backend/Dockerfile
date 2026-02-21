# Multi-stage 빌드: Spring Boot Backend
# Stage 1에서 빌드, Stage 2에서 실행 (이미지 크기 최적화)

# ============================================
# Stage 1: 빌드
# ============================================
# 1. 베이스 이미지
FROM gradle:8.14-jdk21 AS builder
WORKDIR /app

# 2. 의존성 캐싱: Gradle 설정 파일 복사
COPY build.gradle settings.gradle ./
COPY gradle ./gradle
RUN gradle dependencies --no-daemon

# 3. 소스 코드 복사 (src 디렉토리만 명시적 복사)
COPY src ./src

# 4. 빌드 명령어: JAR 파일 빌드
RUN gradle bootJar --no-daemon

# ============================================
# Stage 2: 실행
# ============================================
# 1. 런타임 이미지
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# 2. 헬스체크 도구 설치
RUN apk add --no-cache wget

# 3. non-root 사용자로 실행 (보안)
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

# 4. 산출물 복사: 고정된 파일명만 복사
COPY --from=builder /app/build/libs/app.jar app.jar

# 5. 헬스 체크
# 40초는 워밍업, 그 뒤로 30초마다 체크, 3초 안에 응답 못 하면 실패, 3번 연속 실패면 unhealthy”로
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

EXPOSE 8080

# 6. 시작 명령어
ENTRYPOINT ["java", "-jar", "app.jar"]
