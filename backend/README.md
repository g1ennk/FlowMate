# Backend

## 개요

FlowMate 백엔드 - Spring Boot 4.0 + Java 21 기반 REST API 서버

## 기술 스택

- **Framework**: Spring Boot 4.0.x
- **Language**: Java 21
- **ORM**: Spring Data JPA
- **마이그레이션**: Flyway
- **Database**: MySQL 8.x
- **인증**: X-Client-Id 헤더 (게스트 모드)

## 빠른 시작

### 요구사항

- Java 21
- MySQL 8.x (Docker 또는 로컬 설치)

### 실행

```bash
# 테스트
./gradlew test

# 로컬 실행 (local 프로파일)
./gradlew bootRun --args='--spring.profiles.active=local'

# API 확인: http://localhost:8080/actuator/health
```

## 환경 변수

각 프로파일별 `.env` 파일 또는 시스템 환경 변수:

### Local
```bash
# .env.local
DB_USERNAME=flowmate
DB_PASSWORD=flowmate
```

### Dev
```bash
# .env.dev (예시: .env.dev.example 참고)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=flowmate
DB_USERNAME=flowmate
DB_PASSWORD=flowmate
CORS_ORIGINS=http://localhost:5173,https://dev.flowmate.example.com
```

### Prod
```bash
# .env.prod (예시: .env.prod.example 참고)
DB_HOST=your-rds-endpoint.rds.amazonaws.com
DB_PORT=3306
DB_NAME=flowmate
DB_USERNAME=flowmate_prod
DB_PASSWORD=strong-password-here
CORS_ORIGINS=https://flowmate.yourdomain.com
```

## 프로파일

### local (로컬 개발)
- **파일**: `src/main/resources/application-local.yml`
- **DB**: `localhost:3306/flowmate`
- **로그**: DEBUG 레벨
- **CORS**: `http://localhost:5173`
- **실행**:
  ```bash
  ./gradlew bootRun --args='--spring.profiles.active=local'
  ```

### dev (개발/스테이징 서버)
- **파일**: `src/main/resources/application-dev.yml`
- **DB**: 환경 변수로 설정 (`DB_HOST`, `DB_PORT` 등)
- **로그**: INFO 레벨
- **CORS**: 환경 변수 (`CORS_ORIGINS`)
- **실행**:
  ```bash
  ./gradlew bootRun --args='--spring.profiles.active=dev'
  ```

### prod (프로덕션)
- **파일**: `src/main/resources/application-prod.yml`
- **DB**: 환경 변수 필수 (`DB_HOST`, `DB_PORT` 등)
- **로그**: INFO/WARN 레벨
- **CORS**: 환경 변수 필수 (`CORS_ORIGINS`)
- **커넥션 풀**: 최대 20개
- **실행** (JAR 배포):
  ```bash
  java -jar backend.jar --spring.profiles.active=prod
  ```

## 패키지 구조

```
kr.io.flowmate
├── config/                    # 설정
│   └── CorsConfig.java           # CORS 정책
├── common/                    # 공통
│   └── error/                    # 글로벌 에러 처리
├── todo/                      # Todo 도메인
│   ├── domain/
│   │   └── Todo.java             # 엔티티
│   ├── dto/
│   │   ├── TodoCreateRequest.java
│   │   ├── TodoUpdateRequest.java
│   │   └── TodoResponse.java
│   ├── repository/
│   │   └── TodoRepository.java   # JPA Repository
│   ├── service/
│   │   └── TodoService.java      # 비즈니스 로직
│   └── controller/
│       └── TodoController.java   # REST API
├── session/                   # Session 도메인
│   └── ... (동일 구조)
├── settings/                  # Settings 도메인
│   └── ... (동일 구조)
└── review/                    # Review 도메인
    └── ... (동일 구조)
```

## 핵심 규칙

### 인증

- 모든 API는 `X-Client-Id` 헤더 필수
- 게스트 모드: UUID 기반 사용자 식별
- 멀티유저 대비 설계 (추후 OAuth 전환 가능)

### 에러 응답 포맷

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "validation failed",
    "fields": {
      "title": "title must be at most 200 characters"
    }
  }
}
```

### 타이머/세션 정책

- **타이머 상태(ms)**: 프론트엔드 로컬 관리 (Zustand + localStorage)
- **세션 기록(초)**: 백엔드 저장 (`todo_sessions` 테이블)
- **집계 정본**: 서버의 `todo.sessionCount`, `todo.sessionFocusSeconds`
- **멱등성**: `clientSessionId` 기반 중복 방지

## API 엔드포인트

### Todo
- `GET /api/todos?date=YYYY-MM-DD`: 목록 조회
- `POST /api/todos`: 생성
- `PATCH /api/todos/{id}`: 수정
- `DELETE /api/todos/{id}`: 삭제
- `PUT /api/todos/reorder`: 정렬

### Session
- `GET /api/todos/{todoId}/sessions`: 세션 목록
- `POST /api/todos/{todoId}/sessions`: 세션 생성 (멱등)

### Settings
- `GET /api/settings`: 통합 설정 조회
- `PUT /api/settings/pomodoro-session`: 뽀모도로 설정
- `PUT /api/settings/automation`: 자동화 설정
- `GET /api/settings/mini-days`: 미니 데이 설정 조회
- `PUT /api/settings/mini-days`: 미니 데이 설정 수정

### Review
- `GET /api/reviews?type=daily&periodStart=YYYY-MM-DD`: 단건 조회
- `GET /api/reviews?type=daily&from=YYYY-MM-DD&to=YYYY-MM-DD`: 목록 조회
- `PUT /api/reviews`: Upsert
- `DELETE /api/reviews/{id}`: 삭제

### Actuator (모니터링)
- `GET /actuator/health`: 헬스 체크 (외부 노출)
- `GET /actuator/metrics`: 메트릭 목록
- `GET /actuator/prometheus`: Prometheus 형식 메트릭 (Grafana 수집용, Nginx에서 외부 차단)

> **환경별 노출 범위:**
> - Dev: `health, info, prometheus, metrics`
> - Prod: `health, prometheus, metrics` (info 제외)

## 테스트

```bash
# 전체 테스트
./gradlew test

# 도메인별 테스트
./gradlew test --tests '*Todo*'
./gradlew test --tests '*Session*'
./gradlew test --tests '*Settings*'
./gradlew test --tests '*Review*'

# 빌드
./gradlew build
```

### 테스트 전략

- **현재 기준**: Service 레이어 단위 테스트(Mockito) 중심
- **위치**: `src/test/java/kr/io/flowmate/*/service/*Test.java`
- **대상**: Todo/Session/Settings/Review 핵심 비즈니스 로직

## 데이터베이스

### Flyway 마이그레이션

- **위치**: `src/main/resources/db/migration/`
- **파일**: `V1__init.sql`
- **실행**: 앱 시작 시 자동

### 스키마

#### `todos` 테이블
- Todo 메인 테이블
- 집계 필드: `session_count`, `session_focus_seconds`
- 인덱스: `(user_id, date, mini_day, day_order, created_at)`

#### `todo_sessions` 테이블
- 세션 기록 (초 단위)
- 멱등 키: `(todo_id, client_session_id)` UNIQUE
- 순서 보장: `(todo_id, session_order)` UNIQUE

#### `user_settings` 테이블
- 사용자별 설정 (단일 레코드)
- Pomodoro, Automation, MiniDays 통합

#### `reviews` 테이블
- 회고 (일/주/월)
- Upsert 키: `(user_id, type, period_start)` UNIQUE

## 핵심 로직

### Session 생성 멱등성

```java
// clientSessionId 기반 멱등 처리
// 1. 신규 생성: sessionCount 증가, sessionFocusSeconds 누적
// 2. 재전송: 집계 유지, breakSeconds만 증가 방향 보정
```

### Todo Reorder

- `dayOrder` 필드로 정렬 관리
- 프론트엔드가 계산한 순서를 그대로 저장
- 섹션 간 이동 시 `miniDay`와 `dayOrder` 동시 업데이트

### Settings 기본값

- DB 레코드 없으면 기본값 반환
- 최초 변경 시 레코드 생성
- 3중 보장: DB DEFAULT + 서비스 + 클라이언트

## 관련 문서

- [API 계약](../docs/plan/api.md): 프론트-백 정합 단일 소스
- [데이터 모델](../docs/plan/data.md): ERD, 인덱스 설계
- [Flyway 가이드](../docs/engineering-log/flyway-운영-가이드.md): 마이그레이션 전략
- [멱등성 설계](../docs/engineering-log/멱등성-가이드.md): Session API 멱등 처리
- [동시성 제어](../docs/engineering-log/동시성-제어-가이드.md): 낙관적 락 전략
- [N+1 개선](../docs/engineering-log/n-plus-1-개선-가이드.md): 쿼리 최적화

## 트러블슈팅

### DB 연결 실패

```bash
# MySQL 컨테이너 상태 확인
cd ../infra
docker compose ps

# MySQL 로그 확인
docker compose logs mysql

# 컨테이너 재시작
docker compose restart mysql
```

### Flyway 마이그레이션 실패

```bash
# 마이그레이션 히스토리 확인
mysql -u flowmate -p flowmate
> SELECT * FROM flyway_schema_history;

# 실패한 마이그레이션 삭제 후 재실행
> DELETE FROM flyway_schema_history WHERE success = 0;
```

### 포트 충돌

```bash
# 8080 포트 사용 프로세스 확인
lsof -i :8080

# 프로세스 종료
kill -9 <PID>
```

## Health Check

```bash
# 헬스 체크
curl http://localhost:8080/actuator/health

# 응답 예시
{
  "status": "UP"
}
```
