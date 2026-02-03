# API Spec – Todo + Pomodoro Web App (MVP)

Base URL: `/api`
Auth: 없음(MVP는 게스트, 서버는 `X-Client-Id`를 userId로 사용)
Content-Type: `application/json`
Headers (MVP):
- `X-Client-Id`: 게스트 사용자 식별자(클라이언트에서 생성된 UUID)

---

## 1. Data Contracts

### Todo
```json
{
  "id": "uuid",
  "title": "string",
  "note": "string|null",
  "date": "2026-01-09",
  "miniDay": 0,
  "dayOrder": 0,
  "isDone": false,
  "sessionCount": 2,
  "sessionFocusSeconds": 3000,
  "timerMode": "stopwatch",
  "createdAt": "2026-01-09T12:00:00Z",
  "updatedAt": "2026-01-09T12:10:00Z"
}
```

> miniDay: Day 0(미분류), Day 1~3(시간대)

**참고**: `sessionFocusSeconds`는 **초 단위**입니다.  
**참고**: **Session은 MVP에 포함된 서버 저장 대상**이며 API 응답에는 포함하지 않습니다. 타이머 상태는 클라이언트 localStorage에 유지합니다.

### PomodoroSessionSettings
```json
{
  "flowMin": 25,
  "breakMin": 5,
  "longBreakMin": 15,
  "cycleEvery": 4
}
```

### AutomationSettings
```json
{
  "autoStartBreak": false,
  "autoStartSession": false
}
```
**참고**: `autoStartBreak`, `autoStartSession`는 응답에서 생략될 수 있으며, 프론트는 누락 시 `false`로 처리합니다.

### MiniDaysSettings
```json
{
  "day1": { "label": "오전", "start": "06:00", "end": "12:00" },
  "day2": { "label": "오후", "start": "12:00", "end": "18:00" },
  "day3": { "label": "저녁", "start": "18:00", "end": "24:00" }
}
```
> Day 0(미분류)는 고정이며 설정에 포함하지 않습니다.
> 시간 구간은 연속일 필요가 없으며 각 구간은 start < end 조건을 만족해야 합니다.

### Settings (Combined)
```json
{
  "pomodoroSession": { "flowMin": 25, "breakMin": 5, "longBreakMin": 15, "cycleEvery": 4 },
  "automation": { "autoStartBreak": false, "autoStartSession": false },
  "miniDays": {
    "day1": { "label": "오전", "start": "06:00", "end": "12:00" },
    "day2": { "label": "오후", "start": "12:00", "end": "18:00" },
    "day3": { "label": "저녁", "start": "18:00", "end": "24:00" }
  }
}
```

---

## 2. Todo Endpoints

### 2.1 List Todos
- `GET /api/todos`
- Query Parameters:
  - `date` (optional): `YYYY-MM-DD` 형식. 특정 날짜의 Todo만 조회
- Response 200: `{ "items": Todo[] }`
- Note: date 미지정 시 전체 Todo 반환

### 2.2 Create Todo
- `POST /api/todos`
- Body:
```json
{ "title": "string", "note": "string|null", "date": "2026-01-09", "miniDay": 0, "dayOrder": 0 }
```
- Validation: title 1~200, date는 선택(optional)이며 제공 시 YYYY-MM-DD format
- Note: date 누락 시 서버에서 오늘 날짜로 기본값 적용
- Response 201: `Todo`

### 2.3 Update Todo (partial)
- `PATCH /api/todos/{id}`
- Body: 위 필드 중 일부(any subset)
```json
{ "title": "string", "note": "string|null", "isDone": true, "miniDay": 0, "dayOrder": 3, "timerMode": "stopwatch"|"pomodoro"|null, "sessionCount": number }
```
- Response 200: `Todo`
- Errors: 404 Not Found, 400 Validation Error

### 2.4 Reorder Todos
- `PUT /api/todos/reorder`
- Body:
```json
{ "items": [{ "id": "uuid", "dayOrder": 0, "miniDay": 0 }] }
```
- Response 200: `{ "items": Todo[] }`
- Errors: 400 Validation Error

### 2.5 Delete Todo
- `DELETE /api/todos/{id}`
- Response 204
- Errors: 404 Not Found

---

## 3. Settings Endpoints

### 3.0 Get Settings (Combined)
- `GET /api/settings`
- Response 200: `Settings`
  - Note: 저장은 단일 user_settings 테이블 기준, API는 분리 유지

### 3.1 Get Pomodoro Session Settings
- `GET /api/settings/pomodoro-session`
- Response 200: `PomodoroSessionSettings` (없으면 default 생성/반환)

### 3.2 Update Pomodoro Session Settings
- `PUT /api/settings/pomodoro-session`
- Body:
```json
{
  "flowMin": 25,
  "breakMin": 5,
  "longBreakMin": 15,
  "cycleEvery": 4
}
```
- Validation: flowMin 1~90, breakMin 1~90, longBreakMin 1~90, cycleEvery 1~10
- Response 200: `PomodoroSessionSettings`

### 3.3 Get Automation Settings
- `GET /api/settings/automation`
- Response 200: `AutomationSettings` (없으면 default 생성/반환)
- Note: 누락 시 `false`로 간주

### 3.4 Update Automation Settings
- `PUT /api/settings/automation`
- Body:
```json
{
  "autoStartBreak": false,
  "autoStartSession": false
}
```
- Note: 누락 시 `false`로 처리
- Response 200: `AutomationSettings`

### 3.5 Get MiniDays Settings
- `GET /api/settings/mini-days`
- Response 200: `MiniDaysSettings` (없으면 default 생성/반환)

### 3.6 Update MiniDays Settings
- `PUT /api/settings/mini-days`
- Body:
```json
{
  "day1": { "label": "오전", "start": "06:00", "end": "12:00" },
  "day2": { "label": "오후", "start": "12:00", "end": "18:00" },
  "day3": { "label": "저녁", "start": "18:00", "end": "24:00" }
}
```
- Response 200: `MiniDaysSettings`

---

## 4. Sessions

> Session API는 타이머 완료 시 집중/휴식 기록을 저장하는 단일 인터페이스입니다.
> 뽀모도로/일반 타이머 구분 없이 Session 생성으로 통합됩니다.

### 4.1 List Sessions
- `GET /api/todos/{id}/sessions`
- Response 200:
```json
{
  "items": [
    {
      "id": "uuid",
      "todoId": "uuid",
      "sessionFocusSeconds": 1500,
      "breakSeconds": 300,
      "sessionOrder": 1,
      "createdAt": "2026-01-09T12:00:00Z"
    }
  ]
}
```
> `sessionFocusSeconds`, `breakSeconds`는 **초 단위**입니다.

### 4.2 Create Session
- `POST /api/todos/{id}/sessions`
- Body:
```json
{ "sessionFocusSeconds": 1500, "breakSeconds": 300 }
```
- Behavior:
  - Todo의 `sessionFocusSeconds += body.sessionFocusSeconds`
  - Todo의 `sessionCount += 1`
  - `sessionOrder`는 todo별로 자동 증가
- Note: 뽀모도로 Flow 완료, 일반 타이머 Flow 완료 모두 이 API 사용
- Response 201:
```json
{
  "id": "uuid",
  "todoId": "uuid",
  "sessionFocusSeconds": 1500,
  "breakSeconds": 300,
  "sessionOrder": 3,
  "createdAt": "2026-01-09T12:00:00Z"
}
```

### 4.3 Delete Sessions (Todo 단위)
- `DELETE /api/todos/{id}/sessions`
- Behavior: 해당 Todo의 모든 Session 삭제 (Todo의 집계 값은 유지)
- Response 204

---

## 5. Timer Control

### 5.1 Reset Timer
- `POST /api/todos/{id}/reset`
- Body: `{}` (빈 객체)
- Behavior:
  - `sessionFocusSeconds = 0`
  - `sessionCount = 0`
  - `timerMode = null`
  - 해당 Todo의 모든 Session 삭제
- Response 200:
```json
{
  "id": "uuid",
  "sessionFocusSeconds": 0,
  "sessionCount": 0,
  "timerMode": null,
  "updatedAt": "2026-01-09T12:20:00Z"
}
```
- Errors: 404 Not Found

---

## 6. Error Format (권장)
- Status: 400 / 404 / 500
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title is required",
    "fields": { "title": "Required" }
  }
}
```

---

## 7. 변경 이력

| 날짜       | 변경 내용                                                              |
|------------|------------------------------------------------------------------------|
| 2026-01-09 | Todo에 `date` 필드 추가 (날짜별 관리)                                  |
| 2026-01-09 | AutomationSettings에 `autoStartBreak`, `autoStartSession` 추가         |
| 2026-01-13 | Flow 개념 도입 (`MIN_FLOW_MS` 기준)                                    |
| 2026-01-13 | Todo에 `timerMode` 필드 추가 (타이머 모드 영구 저장)                   |
| 2026-01-13 | 통계 페이지 추가 (`/stats`)                                            |
| 2026-01-22 | 타이머 상태 localStorage 영구 저장으로 변경                            |
| 2026-01-24 | `POST /api/todos/{id}/reset` 추가 (타이머 기록 초기화)                 |
| 2026-01-29 | Todo에 `miniDay`, `dayOrder` 필드 추가 + `PUT /api/todos/reorder` 확장 |
| 2026-01-31 | Session API 추가 (MVP)                                                 |
| 2026-02-02 | Settings 분리 (pomodoro-session, automation, mini-days)                |
| 2026-02-02 | `GET /api/settings` 통합 조회 추가                                     |
| 2026-02-03 | Legacy API 정리: `pomodoro/complete`, `focus/add` 삭제 → Session API로 통합 |
| 2026-02-03 | `GET /api/todos`에 date 쿼리 파라미터 추가                                   |
| 2026-02-03 | Timer reset 응답에 `timerMode` 필드 포함                                   |
| 2026-02-03 | Session payload는 초 단위(`sessionFocusSeconds`, `breakSeconds`)로 고정     |
