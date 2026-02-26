# API Spec – FlowMate

Base URL: `/api`
Auth: `Authorization: Bearer {JWT}` (게스트/회원 모두 동일)
Content-Type: `application/json`

> 게스트는 `POST /api/auth/guest/token`으로 발급받은 guestJWT를 사용.
> 회원은 카카오 로그인 후 발급받은 accessJWT를 사용.
> 두 경우 모두 `Authorization: Bearer {token}` 헤더 방식으로 통일.

---

## 0. 인증 API

### 0.1 게스트 JWT 발급
- `POST /api/auth/guest/token`
- Auth: 불필요
- Response 200:
```json
{ "guestToken": "eyJ..." }
```

### 0.2 카카오 로그인 URL 발급
- `GET /api/auth/kakao/authorize-url`
- Auth: 불필요
- Response 200:
```json
{
  "authorizeUrl": "https://kauth.kakao.com/oauth/authorize?...",
  "state": "eyJ..."
}
```

### 0.3 카카오 인가코드 교환
- `POST /api/auth/kakao/exchange`
- Auth: 불필요
- Body:
```json
{ "code": "string", "state": "eyJ..." }
```
- Response 200:
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "UUID", "email": "string|null", "nickname": "string" }
}
```
- Set-Cookie: `refreshToken=...; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=1209600`
- Error 400: state 서명 불일치 또는 만료
- Error 400: 카카오 인가코드 오류

### 0.4 Access Token 재발급
- `POST /api/auth/refresh`
- Auth: 불필요 (Cookie: `refreshToken` 자동 전송)
- Response 200:
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "UUID", "email": "string|null", "nickname": "string" }
}
```
- Error 401: `refreshToken` 쿠키 없음
- Error 400: Refresh Token 무효/만료/폐기

### 0.5 로그아웃
- `POST /api/auth/logout`
- Auth: 불필요 (Cookie: `refreshToken` 자동 전송)
- Response 204 (No Content)
- Set-Cookie: `refreshToken=""; Max-Age=0`

### 0.6 내 정보
- `GET /api/auth/me`
- Auth: 필요 (회원만)
- Response 200:
```json
{ "id": "UUID", "email": "string|null", "nickname": "string" }
```
- Error 403: 미인증 또는 `ROLE_MEMBER` 아님 (현행 Security 설정 기준)

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

> `miniDay`: Day 0(미분류), Day 1~3(시간대)
> `sessionFocusSeconds`: 초 단위
> `isDone` 키는 응답/요청 모두 고정 사용 (`done` 아님)

### PomodoroSessionSettings
```json
{ "flowMin": 25, "breakMin": 5, "longBreakMin": 15, "cycleEvery": 4 }
```

### AutomationSettings
```json
{ "autoStartBreak": false, "autoStartSession": false }
```

### MiniDaysSettings
```json
{
  "day1": { "label": "오전", "start": "06:00", "end": "12:00" },
  "day2": { "label": "오후", "start": "12:00", "end": "18:00" },
  "day3": { "label": "저녁", "start": "18:00", "end": "24:00" }
}
```

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

> 모든 엔드포인트: `Authorization: Bearer {JWT}` 필요

### 2.1 List Todos
- `GET /api/todos`
- Query: `date` (optional, `YYYY-MM-DD`) — 미지정 시 전체 반환
- Response 200: `{ "items": Todo[] }`

### 2.2 Create Todo
- `POST /api/todos`
- Body:
```json
{ "title": "string", "note": "string|null", "date": "2026-01-09", "miniDay": 0, "dayOrder": 0 }
```
- Validation:
  - `title`: 1~200자 (required)
  - `date`: YYYY-MM-DD (required)
  - `miniDay`: 0~3 (required)
  - `dayOrder`: 0 이상 정수 (required)
- Response 201: `Todo`

### 2.3 Update Todo (partial)
- `PATCH /api/todos/{id}`
- Body:
```json
{ "title": "string", "note": "string|null", "isDone": true, "miniDay": 0, "dayOrder": 3, "timerMode": "stopwatch"|"pomodoro"|null }
```
- Validation: `title` 전달 시 1~200자, 나머지 optional
- Note: `sessionCount`, `sessionFocusSeconds`는 Session API로만 변경
- Response 200: `Todo`
- Error 404, 400

### 2.4 Reorder Todos
- `PUT /api/todos/reorder`
- Body: `{ "items": [{ "id": "uuid", "dayOrder": 0, "miniDay": 0 }] }`
- Response 200: `{ "items": Todo[] }`

### 2.5 Delete Todo
- `DELETE /api/todos/{id}`
- Response 204
- Error 404

---

## 3. Settings Endpoints

> 모든 엔드포인트: `Authorization: Bearer {JWT}` 필요

### 3.1 Get Settings (Combined)
- `GET /api/settings`
- Response 200: `Settings`

### 3.2 Update Pomodoro Session Settings
- `PUT /api/settings/pomodoro-session`
- Body: `PomodoroSessionSettings`
- Validation: flowMin/breakMin/longBreakMin 1~90, cycleEvery 1~10
- Response 200: `PomodoroSessionSettings`

### 3.3 Update Automation Settings
- `PUT /api/settings/automation`
- Body: `AutomationSettings`
- Response 200: `AutomationSettings`

### 3.4 Get MiniDays Settings
- `GET /api/settings/mini-days`
- Response 200: `MiniDaysSettings` (없으면 default 반환)

### 3.5 Update MiniDays Settings
- `PUT /api/settings/mini-days`
- Body: `MiniDaysSettings`
- Validation: label 공백 불가 최대 50자, start/end HH:mm, 각 구간 start < end
- Response 200: `MiniDaysSettings`

---

## 4. Sessions

> 모든 엔드포인트: `Authorization: Bearer {JWT}` 필요

### 4.1 List Sessions
- `GET /api/todos/{todoId}/sessions`
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

### 4.2 Create Session
- `POST /api/todos/{todoId}/sessions`
- Body:
```json
{ "sessionFocusSeconds": 1500, "breakSeconds": 300, "clientSessionId": "uuid-required" }
```
- Validation:
  - `sessionFocusSeconds`: required, 1~43200
  - `breakSeconds`: optional, 0~43200 (미전달 시 0)
  - `clientSessionId`: required, UUID 형식
- Behavior:
  - 신규: Todo 집계 증가, `201 Created`
  - 멱등 재요청 (동일 `todoId + clientSessionId`): 집계 유지, `200 OK`
  - `sessionFocusSeconds` 불일치 시 `400`
  - `breakSeconds`는 증가 방향(`max`)으로만 보정
- Response 201: Session 객체

---

## 5. Reviews

> 모든 엔드포인트: `Authorization: Bearer {JWT}` 필요

### 5.1 Get Review (단건)
- `GET /api/reviews?type={type}&periodStart=YYYY-MM-DD`
- `type`: `daily | weekly | monthly`
- Response 200: Review 객체 또는 `null`

### 5.2 List Reviews (기간 목록)
- `GET /api/reviews?type={type}&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Response 200: `{ "items": Review[] }`

### 5.3 Upsert Review
- `PUT /api/reviews`
- Body:
```json
{
  "type": "daily",
  "periodStart": "2026-02-03",
  "periodEnd": "2026-02-03",
  "content": "오늘 가장 집중한 건 API 설계였다."
}
```
- Response 200: Review 객체

### 5.4 Delete Review
- `DELETE /api/reviews/{id}`
- Response 204

---

## 6. Error Format
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
