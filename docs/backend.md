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
```

---

## 3. 멀티유저 대비(현재는 게스트)
- 인증 없이 동작
- Controller/Service에서 `X-Client-Id`를 `userId`로 사용해 조회/저장
- 나중에 JWT 붙이면 `userId`를 SecurityContext에서 가져오도록 교체

---

## 4. 엔티티 설계

### 4.1 Todo Entity
- id: UUID (PK)
- userId: String (indexed)
- title: String
- note: String?
- miniDay: int (0~3, 섹션 구분)
- dayOrder: int (날짜+miniDay+완료 상태별 정렬용)
- isDone: boolean
- pomodoroDone: int (default 0)
- focusSeconds: int (default 0)
- timerMode: String? ('stopwatch' | 'pomodoro' | null)
- createdAt, updatedAt (auditing 추천)

### 4.2 UserSettings Entity (단일 테이블, API는 분리)
- userId: String (PK)
- flowMin: int default 25
- breakMin: int default 5
- longBreakMin: int default 15
- cycleEvery: int default 4
- autoStartBreak: boolean default false
- autoStartSession: boolean default false
- day1Label, day1StartMin, day1EndMin
- day2Label, day2StartMin, day2EndMin
- day3Label, day3StartMin, day3EndMin
- updatedAt (auditing)
- Note:
  - API는 **세션 설정/자동화/미니데이**로 분리하되, 테이블은 단일 유지
  - Day 0(미분류)은 고정이며 DB에 저장하지 않음
  - 시간은 분 단위(min) 저장을 권장 (API는 HH:MM)

### 4.3 TodoSession Entity (V2 마이그레이션)
- id: UUID (PK)
- todoId: UUID (FK, indexed)
- userId: String (indexed)
- focusSeconds: int (집중 시간, 초)
- breakSeconds: int (휴식 시간, 초)
- sessionOrder: int (세션 순서: 1, 2, 3...)
- createdAt, updatedAt (auditing)
- 참고: sessionHistory는 서버 저장 대상이며, 클라이언트 localStorage는 타이머 상태/백업 용도로 유지
  - miniDay 의미: Day 0(미분류), Day 1~3(시간대)

---

## 5. Flyway 마이그레이션
- `db/migration/V1__init.sql`
  - todos 테이블 (MySQL 기준 타입, UTF8MB4, InnoDB)
  - user_settings 테이블
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
- GET /api/todos
- POST /api/todos
- PATCH /api/todos/{id}
- PUT /api/todos/reorder
- DELETE /api/todos/{id}
- POST /api/todos/{id}/pomodoro/complete
- POST /api/todos/{id}/focus/add
- POST /api/todos/{id}/reset
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
- durationSec: @Min(1) @Max(43200) (권장 상한)
- session settings: flowMin 1~90, breakMin 1~90, longBreakMin 1~90, cycleEvery 1~10
- automation settings: autoStartBreak/autoStartSession은 optional (누락 시 false)
- miniDays settings:
  - label: non-empty
  - 시간 형식: HH:MM, day1End=day2Start, day2End=day3Start

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
