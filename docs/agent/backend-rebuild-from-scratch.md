# FlowMate Backend Rebuild Guide (처음부터 재구현용)

## 0. 문서 목적
- 이 문서는 현재 동작 중인 FlowMate 백엔드를 **처음부터 다시 작성**할 수 있게 만든 실행 가이드다.
- 목표는 "코드 복붙"이 아니라, "왜 이렇게 구성했는지 이해하면서 동일 결과를 만드는 것"이다.

## 1. 완료 기준 (Definition of Done)
- `./gradlew clean test` 통과
- 프론트(`VITE_USE_MOCK=0`)와 연동 시 Zod 에러 없음
- 아래 API 전체가 정상 동작
  - `GET/POST/PATCH/DELETE /api/todos`
  - `PUT /api/todos/reorder`
  - `POST /api/todos/{id}/reset`
  - `GET/POST/DELETE /api/todos/{todoId}/sessions`
  - `GET /api/settings`
  - `GET/PUT /api/settings/pomodoro-session`
  - `GET/PUT /api/settings/automation`
  - `GET/PUT /api/settings/mini-days`
  - `GET/PUT/DELETE /api/reviews` (단건/목록 포함)
- 공통 에러 포맷: `{ "error": { "code", "message", "fields" } }`

## 2. 기준 문서/코드
- API 계약: `/Users/glenn/projects/FlowMate/docs/plan/api.md`
- 데이터 모델: `/Users/glenn/projects/FlowMate/docs/plan/data.md`
- 프론트 타입 기준: `/Users/glenn/projects/FlowMate/frontend/src/api/types.ts`

## 3. 사전 준비
```bash
cd /Users/glenn/projects/FlowMate/backend
java -version
./gradlew --version
```

## 4. 프로젝트 기본 설정

### 4.1 build.gradle
`/Users/glenn/projects/FlowMate/backend/build.gradle`

필수 의존성:
- `spring-boot-starter-web`
- `spring-boot-starter-data-jpa`
- `spring-boot-starter-validation`
- `spring-boot-flyway`
- `spring-boot-h2console`
- `flyway-core`
- `flyway-mysql`
- `h2`(runtime), `mysql-connector-j`(runtime)
- `lombok`
- `spring-boot-starter-test`

핵심 포인트:
- Spring Boot 4에서는 Flyway를 켜려면 `spring-boot-flyway`가 필요하다.
- H2 콘솔을 웹에서 보려면 `spring-boot-h2console`이 필요하다.

### 4.2 application 설정
파일:
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-local.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-dev.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-prod.yml`

로컬(local) 핵심 값:
- JDBC URL: `jdbc:h2:mem:flowmate;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE`
- `spring.jpa.hibernate.ddl-auto=validate`
- `spring.flyway.enabled=true`
- `spring.h2.console.enabled=true`
- `spring.h2.console.path=/h2-console`

## 5. 패키지 구조 (그대로 생성)
```
kr.io.flowmate
  FlowmateBackendApplication.java
  config/
    CorsConfig.java
  common/error/
    ApiError.java
    GlobalExceptionHandler.java
    NotFoundException.java
  todo/
    domain/
      Todo.java
      TimerMode.java
    dto/
      TodoCreateRequest.java
      TodoUpdateRequest.java
      TodoResponse.java
      TodoListResponse.java
      TodoReorderRequest.java
      ResetResponse.java
    repo/
      TodoRepository.java
    service/
      TodoService.java
    web/
      TodoController.java
  session/
    domain/
      Session.java
    dto/
      SessionCreateRequest.java
      SessionResponse.java
      SessionListResponse.java
    repo/
      SessionRepository.java
    service/
      SessionService.java
    web/
      SessionController.java
  settings/
    domain/
      UserSettings.java
    dto/
      PomodoroSessionSettingsRequest.java
      PomodoroSessionSettingsResponse.java
      AutomationSettingsRequest.java
      AutomationSettingsResponse.java
      MiniDayRangeRequest.java
      MiniDayRangeResponse.java
      MiniDaysSettingsRequest.java
      MiniDaysSettingsResponse.java
      SettingsResponse.java
    repo/
      UserSettingsRepository.java
    service/
      SettingsService.java
    web/
      SettingsController.java
  review/
    domain/
      Review.java
      ReviewType.java
    dto/
      ReviewUpsertRequest.java
      ReviewResponse.java
      ReviewListResponse.java
    repo/
      ReviewRepository.java
    service/
      ReviewService.java
    web/
      ReviewController.java
```

## 6. Flyway 스키마 작성
파일:
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/db/migration/V1__init.sql`

테이블:
- `todos`
- `todo_sessions`
- `user_settings`
- `reviews`

중요 정합성 포인트:
- H2 + Hibernate `validate` 환경에서는 `Integer` 엔티티 필드와 SQL 타입을 맞추기 위해 `INT` 사용
- `reviews`는 `UNIQUE (user_id, type, period_start)` 필요

## 7. 구현 순서 (권장)

### Step A. 공통 인프라
- `FlowmateBackendApplication`
- `CorsConfig`
- `ApiError`, `NotFoundException`, `GlobalExceptionHandler`

예외 매핑:
- Validation 관련 -> `400`
- Header 누락 -> `400`
- NotFound -> `404`
- `NoResourceFoundException` -> `404`
- 기타 -> `500` (`INTERNAL_ERROR`)

### Step B. Todo 도메인
- 엔티티/DTO/리포지토리/서비스/컨트롤러 순으로 구현
- `PATCH`는 `JsonNode` 기반 부분 업데이트
- `reset`은 집계 초기화 + 세션 전부 삭제

주의:
- `TodoResponse`의 boolean 필드는 JSON 키가 반드시 `isDone` 이어야 함
- Boot 4 + Jackson 3에서 getter 규칙 때문에 `done`이 나오지 않도록 `getIsDone()`을 명시

### Step C. Session 도메인
- 생성 시 `sessionOrder` 자동 증가
- 생성 시 Todo 집계(`sessionCount`, `sessionFocusSeconds`) 증가
- `DELETE /sessions`는 해당 Todo 세션만 전부 삭제

### Step D. Settings 도메인
- `user_settings` row 없으면 기본값 생성
- 통합 조회(`/api/settings`) + 섹션 조회/수정(`/pomodoro-session`, `/automation`, `/mini-days`)
- `miniDays`는 `HH:MM` <-> 분 변환 로직 필수

### Step E. Review 도메인
- `type`: `daily|weekly|monthly`
- `periodStart` 정규화 규칙
  - daily: 해당 일자
  - weekly: 해당 주 월요일
  - monthly: 해당 월 1일
- 단건 조회 결과가 없으면 `null` 반환

## 8. Spring Boot 4 Jackson 주의사항
이 프로젝트는 Boot 4라 Jackson 관련 패키지가 혼합된다.

- `ObjectMapper`, `JsonNode`, `NullNode`:
  - `tools.jackson.databind.*`
- `@JsonCreator`, `@JsonValue`:
  - `com.fasterxml.jackson.annotation.*`

잘못 섞으면 컴파일 에러/런타임 주입 에러가 발생한다.

## 9. 헤더/인증 규칙
모든 API는 `X-Client-Id`를 userId처럼 사용한다.

예시:
```bash
-H 'X-Client-Id: manual-user-1'
```

## 10. 테스트 작성 순서
테스트 파일:
- `/Users/glenn/projects/FlowMate/backend/src/test/java/kr/io/flowmate/todo/TodoApiIntegrationTest.java`
- `/Users/glenn/projects/FlowMate/backend/src/test/java/kr/io/flowmate/todo/SessionResetIntegrationTest.java`
- `/Users/glenn/projects/FlowMate/backend/src/test/java/kr/io/flowmate/settings/SettingsApiIntegrationTest.java`
- `/Users/glenn/projects/FlowMate/backend/src/test/java/kr/io/flowmate/review/ReviewApiIntegrationTest.java`

테스트 케이스:
- Todo 생성/조회/정렬/삭제
- Todo PATCH nullable 필드/`isDone` 검증
- Session 생성/조회/전체삭제
- Reset 동작
- Settings 통합 조회 + 섹션 GET/PUT
- Review upsert/get/list/delete
- `X-Client-Id` 누락 400

실행:
```bash
cd /Users/glenn/projects/FlowMate/backend
./gradlew clean test
```

## 11. 프론트 연동 점검
프론트 env:
```env
VITE_USE_MOCK=0
VITE_API_BASE_URL=http://localhost:8080/api
```

검증 포인트:
- Todo 수정 시 Zod 에러 없음 (`isDone` 필드 파싱)
- Settings/mini-days 호출 정상
- Review 단건 조회 null 처리 정상

## 12. DB 확인 방법
H2 콘솔:
- URL: `http://localhost:8080/h2-console/`
- JDBC URL: `jdbc:h2:mem:flowmate;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE`
- User: `sa`
- Password: (빈값)

## 13. 빠른 트러블슈팅

### 13.1 `ERR_CONNECTION_REFUSED`
- 백엔드 미기동 또는 포트 충돌
- `lsof -nP -iTCP:8080 -sTCP:LISTEN`

### 13.2 `Schema validation` 에러
- 엔티티 타입과 SQL 타입 불일치 (`TINYINT/SMALLINT` vs `INT`)
- Flyway 미적용 여부 확인 (`spring-boot-flyway` 의존성)

### 13.3 `No static resource h2-console`
- `spring-boot-h2console` 의존성 누락
- `/h2-console/` 경로로 접속

### 13.4 `isDone expected boolean, received undefined`
- 응답 JSON에 `isDone` 키가 빠진 상태
- `TodoResponse` getter/직렬화 필드명 확인

## 14. 최종 체크 커맨드
```bash
cd /Users/glenn/projects/FlowMate/backend
./gradlew clean test
./gradlew bootRun --args='--spring.profiles.active=local'

# 별도 터미널
curl -s -H 'X-Client-Id: u1' http://localhost:8080/api/todos
curl -s -H 'X-Client-Id: u1' http://localhost:8080/api/settings
curl -s -H 'X-Client-Id: u1' 'http://localhost:8080/api/reviews?type=daily&periodStart=2026-02-06'
```

이 3개가 정상 응답이면 FE 연동 전제는 갖춰진 상태다.
