# Backend Implementation Plan (Spring Boot)

> API 계약의 단일 소스는 `docs/plan/api.md`입니다. 구현/검증은 해당 문서를 기준으로 합니다.

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
      FocusAddRequest.java
      FocusAddResponse.java
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
- order: int (날짜+완료 상태별 정렬용)
- isDone: boolean
- pomodoroDone: int (default 0)
- focusSeconds: int (default 0)
- timerMode: String? ('stopwatch' | 'pomodoro' | null)
- createdAt, updatedAt (auditing 추천)

### 4.2 PomodoroSettings Entity
- userId: String (PK)
- flowMin: int default 25
- breakMin: int default 5
- longBreakMin: int default 15
- cycleEvery: int default 4
- autoStartBreak: boolean default false
- autoStartSession: boolean default false
- Note: 요청에서 누락되면 false로 처리 (백워드 호환)

### 4.3 TodoSession Entity (V2 마이그레이션)
- id: UUID (PK)
- todoId: UUID (FK, indexed)
- userId: String (indexed)
- focusSeconds: int (집중 시간, 초)
- breakSeconds: int (휴식 시간, 초)
- sessionOrder: int (세션 순서: 1, 2, 3...)
- createdAt, updatedAt (auditing)
- 참고: 서버 저장은 추후 설계 (현재는 클라이언트 localStorage에만 저장)

---

## 5. Flyway 마이그레이션
- `db/migration/V1__init.sql`
  - todos 테이블 (MySQL 기준 타입, UTF8MB4, InnoDB)
  - pomodoro_settings 테이블
  - 인덱스: todos(user_id, created_at)
- `db/migration/V2__add_session_history.sql` (추후)
  - todo_sessions 테이블
  - 인덱스: todo_sessions(todo_id, user_id)
  - 상세 스키마는 추후 확정

---

## 6. 서비스 로직

### 6.1 TodoService
- list(userId)
- create(userId, dto)
- update(userId, id, dto)
- delete(userId, id)
- completePomodoro(userId, id, durationSec)
  - pomodoroDone += 1, focusSeconds += durationSec
  - durationSec validation
  - (선택) optimistic locking: version 컬럼
- addFocus(userId, id, durationSec)
  - focusSeconds += durationSec (pomodoroDone 증가 없음)
  - 일반 타이머 전용
- resetTimer(userId, id)
  - focusSeconds = 0, pomodoroDone = 0, timerMode = null

### 6.2 PomodoroSettingsService
- get(userId)
  - 없으면 default 반환 또는 생성 후 반환(권장: 생성)
- update(userId, dto)
  - validation 체크
  - autoStartBreak/autoStartSession 누락 시 false로 보정

---

## 7. 컨트롤러(요약)
- GET /api/todos
- POST /api/todos
- PATCH /api/todos/{id}
- PUT /api/todos/reorder
- DELETE /api/todos/{id}
- POST /api/todos/{id}/pomodoro/complete
- POST /api/todos/{id}/focus/add
- POST /api/todos/{id}/reset
- GET /api/settings/pomodoro
- PUT /api/settings/pomodoro

---

## 8. Validation
- title: @NotBlank, @Size(max=200)
- durationSec: @Min(1) @Max(43200) (권장 상한)
- settings: flowMin 1~90, breakMin 1~90, longBreakMin 1~90, cycleEvery 1~10 (autoStartBreak/autoStartSession은 optional)

---

## 9. 에러 처리
- @ControllerAdvice로 통일된 에러 포맷
  - 400 validation: `{error:{code,message,fields}}`
  - 404 not found
  - 500 internal

---

## 10. 개발/운영 환경
- local profile: H2
- dev profile: MySQL
- prod profile: MySQL
- CORS: 프론트 dev origin 허용
