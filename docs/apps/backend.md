# Backend Implementation Plan (Spring Boot)

> API 계약의 단일 소스는 `docs/plan/api.md`입니다. 구현/검증은 해당 문서를 기준으로 합니다.
> MVP는 게스트 모드이며, `X-Client-Id` 헤더 값을 `userId`로 사용합니다.

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
      ResetResponse.java
    repo/
      TodoRepository.java
    service/
      TodoService.java
    web/
      TodoController.java
  settings/
    domain/
      UserSettings.java
    dto/
      PomodoroSessionSettingsRequest.java
      PomodoroSessionSettingsResponse.java
      AutomationSettingsRequest.java
      AutomationSettingsResponse.java
      MiniDaysSettingsRequest.java
      MiniDaysSettingsResponse.java
    repo/
      UserSettingsRepository.java
    service/
      SettingsService.java
    web/
      SettingsController.java
  session/
    domain/
      Session.java
    dto/
      SessionCreateRequest.java
      SessionResponse.java
    repo/
      SessionRepository.java
    service/
      SessionService.java
    web/
      SessionController.java
```

---

## 3. 멀티유저 대비(현재는 게스트)
- 인증 없이 동작
- Controller/Service에서 `X-Client-Id`를 `userId`로 사용해 조회/저장
- 나중에 JWT 붙이면 `userId`를 SecurityContext에서 가져오도록 교체

---

## 4. 엔티티 설계

- 상세 스키마는 `docs/plan/data.md`를 단일 소스로 사용
- 본 문서는 **서비스/엔드포인트/검증 규칙**에 집중

---

## 5. Flyway 마이그레이션
- `db/migration/V1__init.sql`
  - todos 테이블 (MySQL 기준 타입, UTF8MB4, InnoDB)
  - user_settings 테이블
  - todo_sessions 테이블 (Session 기록)
  - 인덱스: `todos(user_id, date)`, `todos(user_id, date, is_done, mini_day, day_order)`

---

## 6. 서비스 로직

### 6.1 TodoService
- list(userId, date?) - date 파라미터로 필터링 (optional)
- create(userId, dto)
- update(userId, id, dto)
- delete(userId, id)
- reorder(userId, items)
- resetTimer(userId, id)
  - sessionFocusSeconds = 0, sessionCount = 0, timerMode = null
  - 해당 Todo의 Session 삭제

### 6.3 SessionService
- list(userId, todoId)
- create(userId, todoId, sessionFocusSeconds, breakSeconds)
  - 세션 시간 단위: 초 (`sessionFocusSeconds`, `breakSeconds`)
  - sessionOrder 자동 증가
  - sessionFocusSeconds 누적
  - sessionCount += 1 (Session은 Flow로 인정된 경우만 생성)
- deleteAll(userId, todoId)

### 6.2 SettingsService (단일 테이블)
- getSession(userId)
  - 없으면 default 반환 또는 생성 후 반환(권장: 생성)
- updateSession(userId, dto)
  - validation 체크
- getAutomation(userId)
  - 없으면 default 반환 또는 생성 후 반환
- updateAutomation(userId, dto)
  - autoStartBreak/autoStartSession 누락 시 false로 보정
- getMiniDays(userId)
  - 없으면 default 반환 또는 생성 후 반환
- updateMiniDays(userId, dto)
  - validation 체크
- getSettings(userId)
  - 세션/자동화/미니데이 통합 조회 (GET /api/settings)

---

## 7. 컨트롤러(요약)
- GET /api/todos?date=YYYY-MM-DD (date optional)
- POST /api/todos
- PATCH /api/todos/{id}
- PUT /api/todos/reorder
- DELETE /api/todos/{id}
- POST /api/todos/{id}/reset
- GET /api/todos/{id}/sessions
- POST /api/todos/{id}/sessions
- DELETE /api/todos/{id}/sessions
- GET /api/settings
- GET /api/settings/pomodoro-session
- PUT /api/settings/pomodoro-session
- GET /api/settings/automation
- PUT /api/settings/automation
- GET /api/settings/mini-days
- PUT /api/settings/mini-days

---

## 8. Validation
- title: @NotBlank, @Size(max=200)
- sessionFocusSeconds, breakSeconds: @Min(0) @Max(43200) (권장 상한)
  - 단위: 초 (Seconds)
- session settings: flowMin 1~90, breakMin 1~90, longBreakMin 1~90, cycleEvery 1~10
- automation settings: autoStartBreak/autoStartSession은 optional (누락 시 false)
- miniDays settings:
  - label: non-empty
  - 시간 형식: HH:MM (day3 end는 24:00 허용)
  - 각 구간은 start < end를 만족해야 하며, 구간 간 공백 허용

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
