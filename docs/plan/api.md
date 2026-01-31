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
  "isDone": false,
  "order": 0,
  "pomodoroDone": 2,
  "focusSeconds": 3000,
  "timerMode": "stopwatch",
  "createdAt": "2026-01-09T12:00:00Z",
  "updatedAt": "2026-01-09T12:10:00Z"
}
```

**참고**: `sessionHistory`는 **서버 저장 대상**이며 API 응답에는 포함하지 않습니다. 클라이언트는 타이머 상태/임시 백업만 localStorage에 유지합니다.

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
**참고**: `autoStartBreak`, `autoStartSession`는 응답에서 생략될 수 있으며, 프론트는 누락 시 `false`로 처리합니다.

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
- Validation: title 1~200, date는 선택(optional)이며 제공 시 YYYY-MM-DD format
- Note: date 누락 시 서버에서 오늘 날짜로 기본값 적용
- Response 201: `Todo`

### 2.3 Update Todo (partial)
- `PATCH /api/todos/{id}`
- Body: 위 필드 중 일부(any subset)
```json
{ "title": "string", "note": "string|null", "isDone": true, "order": 3, "timerMode": "stopwatch"|"pomodoro"|null, "pomodoroDone": number }
```
- Response 200: `Todo`
- Errors: 404 Not Found, 400 Validation Error

### 2.4 Reorder Todos
- `PUT /api/todos/reorder`
- Body:
```json
{ "items": [{ "id": "uuid", "order": 0 }] }
```
- Response 200: `{ "items": Todo[] }`
- Errors: 400 Validation Error

### 2.5 Delete Todo
- `DELETE /api/todos/{id}`
- Response 204
- Errors: 404 Not Found

---

## 3. Pomodoro Settings Endpoints

### 3.1 Get Settings
- `GET /api/settings/pomodoro`
- Response 200: `PomodoroSettings` (없으면 default 생성/반환)
- Note: `autoStartBreak`, `autoStartSession` 누락 시 `false`로 간주

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
- Validation: flowMin 1~90, breakMin 1~90, longBreakMin 1~90, cycleEvery 1~10
- Note: `autoStartBreak`, `autoStartSession`은 선택(optional)이며 누락 시 `false`로 처리
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
- Errors: 404 Not Found, 400 Validation Error (durationSec 1~43200 권장)
 - Note: 완료/누적 API는 `timerMode`를 변경하지 않음 (모드는 `PATCH /api/todos/{id}`로 동기화)

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
- Errors: 404 Not Found, 400 Validation Error (durationSec 1~43200 권장)
- Note: 일반 타이머(Stopwatch)는 시간만 누적하고 세션 횟수는 증가시키지 않음

### 4.3 Reset Timer
- `POST /api/todos/{id}/reset`
- Body: `{}` (빈 객체)
- Behavior: `focusSeconds=0`, `pomodoroDone=0`, `timerMode=null`
- Response 200:
```json
{
  "id": "uuid",
  "focusSeconds": 0,
  "pomodoroDone": 0,
  "updatedAt": "2026-01-09T12:20:00Z"
}
```

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

| 날짜       | 변경 내용                                                         |
| ---------- | ----------------------------------------------------------------- |
| 2026-01-09 | Todo에 `date` 필드 추가 (날짜별 관리)                             |
| 2026-01-09 | PomodoroSettings에 `autoStartBreak`, `autoStartSession` 추가      |
| 2026-01-09 | `POST /api/todos/{id}/focus/add` API 추가 (일반 타이머 전용)      |
| 2026-01-13 | 일반 타이머 세션 히스토리 추가 (`sessionHistory`)                 |
| 2026-01-13 | Flow 개념 도입 (`MIN_FLOW_MS` 기준)                               |
| 2026-01-13 | Todo에 `timerMode` 필드 추가 (타이머 모드 영구 저장)              |
| 2026-01-13 | 통계 페이지 추가 (`/stats`)                                       |
| 2026-01-13 | 홈 화면 시간 표시 개선 (추천 휴식 카운트다운, 자유 휴식 카운트업) |
| 2026-01-13 | 뽀모도로 타이머에도 `sessionHistory` 추가                        |
| 2026-01-22 | `sessionHistory`를 localStorage에 영구 저장으로 변경              |
| 2026-01-24 | `POST /api/todos/{id}/reset` 추가 (타이머 기록 초기화)            |
| 2026-01-29 | Todo에 `order` 필드 추가 + `PUT /api/todos/reorder` 추가          |
| 2026-01-31 | `sessionHistory` 서버 저장 정책 확정 (타이머 상태는 클라 유지)     |
