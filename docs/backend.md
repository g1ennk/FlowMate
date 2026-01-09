# Backend Implementation Plan (Spring Boot)

## 1. 모듈
- spring-boot-starter-web
- spring-boot-starter-validation
- spring-boot-starter-data-jpa
- flyway-core
- mysql driver (dev: h2 optional)

---

## 2. 패키지 구조(추천)
```
com.example.flowtodo
  config/
    CorsConfig.java
  common/
    error/
      ApiError.java
      GlobalExceptionHandler.java
      NotFoundException.java
  todo/
    domain/
      Todo.java
    dto/
      TodoCreateRequest.java
      TodoUpdateRequest.java
      TodoResponse.java
      PomodoroCompleteRequest.java
      PomodoroCompleteResponse.java
    repo/
      TodoRepository.java
    service/
      TodoService.java
    web/
      TodoController.java
  settings/
    domain/
      PomodoroSettings.java
    dto/
      PomodoroSettingsRequest.java
      PomodoroSettingsResponse.java
    repo/
      PomodoroSettingsRepository.java
    service/
      PomodoroSettingsService.java
    web/
      PomodoroSettingsController.java
```

---

## 3. 멀티유저 대비(현재는 local)
- 인증 없이 동작
- Controller/Service에서 항상 `userId = "local"`로 조회/저장
- 나중에 JWT 붙이면 `userId`를 SecurityContext에서 가져오도록 교체

---

## 4. 엔티티 설계

### 4.1 Todo Entity
- id: UUID (PK)
- userId: String (indexed)
- title: String
- note: String?
- isDone: boolean
- pomodoroDone: int (default 0)
- focusSeconds: int (default 0)
- createdAt, updatedAt (auditing 추천)

### 4.2 PomodoroSettings Entity
- userId: String (PK)
- flowMin: int default 25
- breakMin: int default 5
- longBreakMin: int default 15
- cycleEvery: int default 4

---

## 5. Flyway 마이그레이션
- `db/migration/V1__init.sql`
  - todos 테이블 (MySQL 기준 타입, UTF8MB4, InnoDB)
  - pomodoro_settings 테이블
  - 인덱스: todos(user_id, created_at)

---

## 6. 서비스 로직

### 6.1 TodoService
- list(userId)
- create(userId, dto)
- update(userId, id, dto)
- delete(userId, id)
- completePomodoro(userId, id, durationSec)
  - durationSec validation
  - (선택) optimistic locking: version 컬럼

### 6.2 PomodoroSettingsService
- get(userId)
  - 없으면 default 반환 또는 생성 후 반환(권장: 생성)
- update(userId, dto)
  - validation 체크

---

## 7. 컨트롤러(요약)
- GET /api/todos
- POST /api/todos
- PATCH /api/todos/{id}
- DELETE /api/todos/{id}
- POST /api/todos/{id}/pomodoro/complete
- GET /api/settings/pomodoro
- PUT /api/settings/pomodoro

---

## 8. Validation
- title: @NotBlank, @Size(max=200)
- durationSec: @Min(1) @Max(10800) (권장 상한)
- settings: PRD 범위 동일

---

## 9. 에러 처리
- @ControllerAdvice로 통일된 에러 포맷
  - 400 validation: `{error:{code,message,fields}}`
  - 404 not found
  - 500 internal

---

## 10. 개발/운영 환경
- dev profile: H2 가능
- prod profile: MySQL
- CORS: 프론트 dev origin 허용

