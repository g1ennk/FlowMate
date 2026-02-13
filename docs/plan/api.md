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
> `isDone` 키는 응답/요청 모두 고정 사용합니다. (`done` 아님)

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
**참고**: `autoStartBreak`, `autoStartSession`는 항상 응답에 포함됩니다.

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
- Note:
  - `date` 미지정 시 전체 Todo 반환(기본 조회)
  - `date` 지정 시 해당 날짜만 필터 조회

### 2.2 Create Todo
- `POST /api/todos`
- Body:
```json
{ "title": "string", "note": "string|null", "date": "2026-01-09", "miniDay": 0, "dayOrder": 0 }
```
- Validation: 
  - `title`: 1~200자 (required)
  - `date`: YYYY-MM-DD 형식 (required, 프론트엔드가 캘린더 선택값 전달)
  - `miniDay`: 0~3 (required, 프론트엔드가 섹션 선택값 전달)
  - `dayOrder`: 0 이상 정수 (required, 프론트엔드가 자동 계산하여 전달)
- Note:
  - 프론트엔드는 모든 필드를 항상 전달합니다
  - 서버는 전달된 값을 그대로 저장합니다
- Response 201: `Todo`

### 2.3 Update Todo (partial)
- `PATCH /api/todos/{id}`
- Body: 위 필드 중 일부(any subset)
```json
{ "title": "string", "note": "string|null", "isDone": true, "miniDay": 0, "dayOrder": 3, "timerMode": "stopwatch"|"pomodoro"|null }
```
- Note: `sessionCount`와 `sessionFocusSeconds`는 직접 수정 불가능 (Session API를 통해서만 변경)
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
  - Note:
    - 설정 화면 기본 로딩은 `GET /api/settings` 1회로 처리
    - 저장은 단일 `user_settings` 테이블 기준, API는 섹션별 PUT 유지

### 3.0.1 조회 전략 (현재 클라이언트)
- 기본: `GET /api/settings` (통합 조회)
- 분리 GET (`/pomodoro-session`, `/automation`, `/mini-days`)은 하위 리소스 직접 조회/디버깅 용도

### 3.1 Get Pomodoro Session Settings
- `GET /api/settings/pomodoro-session`
- Response 200: `PomodoroSessionSettings` (없으면 default 반환, DB 저장 안 함)

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
- Note: 클라이언트는 변경된 세션 필드가 있을 때만 호출
- Response 200: `PomodoroSessionSettings`

### 3.3 Get Automation Settings
- `GET /api/settings/automation`
- Response 200: `AutomationSettings` (없으면 default 반환, DB 저장 안 함)
- Note: 두 필드는 항상 반환됩니다.

### 3.4 Update Automation Settings
- `PUT /api/settings/automation`
- Body:
```json
{
  "autoStartBreak": false,
  "autoStartSession": false
}
```
- Validation: `autoStartBreak`, `autoStartSession` 모두 required(boolean)
- Note: 클라이언트는 변경된 자동화 필드가 있을 때만 호출
- Response 200: `AutomationSettings`

### 3.5 Get MiniDays Settings
- `GET /api/settings/mini-days`
- Response 200: `MiniDaysSettings` (없으면 default 반환, DB 저장 안 함)

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
- Validation:
  - `label`: 공백 불가, 최대 50자
  - `start`: `HH:mm` (`00:00`~`23:59`)
  - `end`: `HH:mm` 또는 `24:00`
  - 각 구간은 `start < end`
- Response 200: `MiniDaysSettings`

### 3.7 PATCH vs PUT 기준
- Todo는 일부 필드만 갱신하는 경우가 많아 `PATCH` 사용
- Settings는 섹션 리소스(세션/자동화/미니데이) 전체 표현을 저장하므로 `PUT` 사용
- 단, 현재 클라이언트 정책은 "변경된 섹션만 PUT"으로 최소 호출

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
> 현재 프론트엔드 세션 상세(`SessionDetailSheet`)는 이 엔드포인트를 사용합니다.

### 4.2 Create Session
- `POST /api/todos/{id}/sessions`
- Body:
```json
{ "sessionFocusSeconds": 1500, "breakSeconds": 300, "clientSessionId": "uuid-required" }
```
- Validation (SessionCreateRequest DTO 기준):
  - `sessionFocusSeconds`: required, 정수, `1..43200`
  - `breakSeconds`: optional, 정수, `0..43200` (미전달 시 `0`)
  - `clientSessionId`: required, 공백 불가, UUID 형식
- Behavior:
  - 신규(`todoId + clientSessionId` 미존재):
    - Todo의 `sessionFocusSeconds += body.sessionFocusSeconds`
    - Todo의 `sessionCount += 1`
    - `sessionOrder`는 todo별로 자동 증가
    - `201 Created`
  - 멱등 재요청(`todoId + clientSessionId` 존재):
    - Todo 집계(`sessionCount`, `sessionFocusSeconds`)는 증가하지 않음
    - 요청 `sessionFocusSeconds`가 기존 세션과 다르면 `400 Bad Request`
    - 요청 `breakSeconds`가 기존 값보다 크면 `breakSeconds`를 증가 방향으로 보정
    - `200 OK`
- Note:
  - 뽀모도로 Flow 완료, 일반 타이머 세션 확정 시 이 API 사용
  - 휴식 시작 시점이 아니라 **세션 확정 시점**에 호출
  - `clientSessionId`는 필수값이며, 서버 멱등 처리(중복 생성 방지) 키로 사용
  - `breakSeconds`는 동일 `clientSessionId` 재전송으로 사후 보정(증가 방향) 가능
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
- 멱등 재요청(동일 `todoId + clientSessionId`)은 `200`으로 기존/보정 세션을 반환할 수 있음

### 4.3 Delete Sessions (Todo 단위)
- `DELETE /api/todos/{id}/sessions`
- Behavior:
  - 해당 Todo의 모든 Session 삭제
  - Todo 집계(`sessionCount`, `sessionFocusSeconds`)를 즉시 `0`으로 동기화
- Response 204
> 현재 프론트엔드에서는 이 엔드포인트를 호출하지 않습니다. (세션 삭제 UI는 미구현)

---

## 5. Reviews (회고)

### 5.1 Get Review (단건)
- `GET /api/reviews?type={type}&periodStart=YYYY-MM-DD`
  - `type`: `daily | weekly | monthly`
  - Note: 현재 UI는 `daily, weekly, monthly`를 사용
  - Response 200:
```json
{
  "id": "uuid",
  "type": "daily",
  "periodStart": "2026-02-03",
  "periodEnd": "2026-02-03",
  "content": "오늘 가장 집중한 건 API 설계였다.",
  "createdAt": "2026-02-03T10:30:00Z",
  "updatedAt": "2026-02-03T10:40:00Z"
}
```
  - 데이터가 없으면 `null` 반환

### 5.2 List Reviews (기간 목록)
- `GET /api/reviews?type={type}&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Response 200:
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "daily",
      "periodStart": "2026-02-03",
      "periodEnd": "2026-02-03",
      "content": "오늘 가장 집중한 건 API 설계였다.",
      "createdAt": "2026-02-03T10:30:00Z",
      "updatedAt": "2026-02-03T10:40:00Z"
    }
  ]
}
```
  - Note: 리뷰 화면에서 단건 본문 + 캘린더 마킹을 위해 단건/목록 GET이 함께 호출될 수 있음

### 5.3 Upsert Review
- `PUT /api/reviews` (upsert)
  - Request:
```json
{
  "type": "daily",
  "periodStart": "2026-02-03",
  "periodEnd": "2026-02-03",
  "content": "오늘 가장 집중한 건 API 설계였다."
}
```
  - Response 200:
```json
{
  "id": "uuid",
  "type": "daily",
  "periodStart": "2026-02-03",
  "periodEnd": "2026-02-03",
  "content": "오늘 가장 집중한 건 API 설계였다.",
  "createdAt": "2026-02-03T10:30:00Z",
  "updatedAt": "2026-02-03T10:40:00Z"
}
```
  - Note: 회고 upsert는 `PUT`이며 `POST /api/reviews`는 사용하지 않음

### 5.4 Delete Review
- `DELETE /api/reviews/{id}`
  - Response 204 No Content

---

## 6. Error Format (권장)
- Status: 400 / 404 / 500
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title is required",
    "fields": {
      "title": "Required"
    }
  }
}
```
