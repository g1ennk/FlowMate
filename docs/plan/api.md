# API Spec – Todo + Pomodoro Web App (MVP)

Base URL: `/api`
Auth: 없음(MVP 단일 사용자, 서버 내부 userId="local")
Content-Type: `application/json`

---

## 1. Data Contracts

### Todo
```json
{
  "id": "uuid",
  "title": "string",
  "note": "string|null",
  "date": "2026-01-09",
  "isDone": false,
  "pomodoroDone": 2,
  "focusSeconds": 3000,
  "createdAt": "2026-01-09T12:00:00Z",
  "updatedAt": "2026-01-09T12:10:00Z"
}
```

### PomodoroSettings
```json
{
  "flowMin": 25,
  "breakMin": 5,
  "longBreakMin": 15,
  "cycleEvery": 4,
  "autoStartBreak": false,
  "autoStartSession": false
}
```

---

## 2. Todo Endpoints

### 2.1 List Todos
- `GET /api/todos`
- Response 200: `{ "items": Todo[] }`

### 2.2 Create Todo
- `POST /api/todos`
- Body:
```json
{ "title": "string", "note": "string|null", "date": "2026-01-09" }
```
- Validation: title 1~200, date YYYY-MM-DD format
- Response 201: `Todo`

### 2.3 Update Todo (partial)
- `PATCH /api/todos/{id}`
- Body: 위 필드 중 일부(any subset)
```json
{ "title": "string", "note": "string|null", "isDone": true, "date": "2026-01-09" }
```
- Response 200: `Todo`
- Errors: 404 Not Found, 400 Validation Error

### 2.4 Delete Todo
- `DELETE /api/todos/{id}`
- Response 204
- Errors: 404 Not Found

---

## 3. Pomodoro Settings Endpoints

### 3.1 Get Settings
- `GET /api/settings/pomodoro`
- Response 200: `PomodoroSettings` (없으면 default 생성/반환)

### 3.2 Update Settings
- `PUT /api/settings/pomodoro`
- Body:
```json
{
  "flowMin": 25,
  "breakMin": 5,
  "longBreakMin": 15,
  "cycleEvery": 4,
  "autoStartBreak": false,
  "autoStartSession": false
}
```
- Validation: flowMin 1~180, breakMin 1~60, longBreakMin 1~120, cycleEvery 1~12
- Response 200: `PomodoroSettings`

---

## 4. Timer Completion

### 4.1 Complete a Pomodoro Flow
- `POST /api/todos/{id}/pomodoro/complete`
- Body:
```json
{ "durationSec": 1500 }
```
- Behavior: `pomodoroDone += 1`, `focusSeconds += durationSec`, `updatedAt` 갱신
- Response 200:
```json
{
  "id": "uuid",
  "pomodoroDone": 3,
  "focusSeconds": 4500,
  "updatedAt": "2026-01-09T12:20:00Z"
}
```
- Errors: 404 Not Found, 400 Validation Error (durationSec 1~10800 권장)

### 4.2 Add Focus Time (일반 타이머)
- `POST /api/todos/{id}/focus/add`
- Body:
```json
{ "durationSec": 900 }
```
- Behavior: `focusSeconds += durationSec` (pomodoroDone은 증가 안 함), `updatedAt` 갱신
- Response 200:
```json
{
  "id": "uuid",
  "focusSeconds": 4500,
  "updatedAt": "2026-01-09T12:20:00Z"
}
```
- Errors: 404 Not Found, 400 Validation Error (durationSec 1~10800 권장)
- Note: 일반 타이머(Stopwatch)는 시간만 누적하고 세션 횟수는 증가시키지 않음

---

## 5. Error Format (권장)
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

## 6. 변경 이력

| 날짜       | 변경 내용                                                    |
| ---------- | ------------------------------------------------------------ |
| 2026-01-09 | Todo에 `date` 필드 추가 (날짜별 관리)                        |
| 2026-01-09 | PomodoroSettings에 `autoStartBreak`, `autoStartSession` 추가 |
| 2026-01-09 | `POST /api/todos/{id}/focus/add` API 추가 (일반 타이머 전용) |