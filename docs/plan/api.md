# API Spec – FlowMate

> 상태: current
> 역할: 현재 API 계약 정본

Base URL: `/api`
Auth: `Authorization: Bearer {JWT}` (게스트/회원 공통, 단 `GET /api/timer/sse`는 query token 사용)
Content-Type: `application/json` (`GET /api/timer/sse`는 `text/event-stream`)

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
- Error 401: 미인증
- Error 403: 인증됐지만 `ROLE_MEMBER` 아님

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
> `date`: 실제 완료일이 아니라 계획일/소속일
> `dayOrder`: `date + miniDay + 완료상태(active/done)` 레인 내부 순서값
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

### TimerStatePushBody
```json
{
  "status": "running",
  "state": {
    "mode": "pomodoro",
    "phase": "flow",
    "status": "running",
    "endAt": 1772455500000,
    "remainingMs": null,
    "elapsedMs": 0,
    "initialFocusMs": 0,
    "startedAt": null,
    "cycleCount": 0,
    "settingsSnapshot": { "flowMin": 25, "breakMin": 5, "longBreakMin": 15, "cycleEvery": 4 },
    "flexiblePhase": null,
    "focusElapsedMs": 0,
    "breakElapsedMs": 0,
    "breakTargetMs": null,
    "breakCompleted": false,
    "focusStartedAt": null,
    "breakStartedAt": null,
    "breakSessionPendingUpdate": false,
    "sessions": []
  }
}
```

> `status`: `idle | running | paused | waiting`
> `idle`이면 `state`는 반드시 `null`, non-idle이면 `state`는 반드시 non-null

### TimerStateResponse
```json
{
  "todoId": "uuid",
  "state": {
    "mode": "stopwatch",
    "phase": "flow",
    "status": "paused",
    "endAt": null,
    "remainingMs": null,
    "elapsedMs": 1200000,
    "initialFocusMs": 0,
    "startedAt": null,
    "cycleCount": 0,
    "settingsSnapshot": null,
    "flexiblePhase": "focus",
    "focusElapsedMs": 1200000,
    "breakElapsedMs": 0,
    "breakTargetMs": null,
    "breakCompleted": false,
    "focusStartedAt": 1772454032000,
    "breakStartedAt": null,
    "breakSessionPendingUpdate": false,
    "sessions": []
  },
  "serverTime": 1772454032001
}
```

> `serverTime`은 wall-clock 타임스탬프가 아니라 `timer_states.version` 기반 최신성 판정 값이다.
> SSE와 `GET /api/timer/state`는 모두 이 값을 동일한 최신성 기준으로 사용한다.

### SingleTimerState (요약)

`state` 필드는 프론트 `SingleTimerState`를 그대로 직렬화한 JSON blob이다. 주요 필드는 아래와 같다.

- 공통
  - `mode`: `pomodoro | stopwatch`
  - `phase`: `flow | short | long`
  - `status`: `idle | running | paused | waiting`
  - `endAt`, `remainingMs`, `elapsedMs`, `initialFocusMs`, `startedAt`
  - `cycleCount`, `settingsSnapshot`
- stopwatch 전용
  - `flexiblePhase`: `focus | break_suggested | break_free | null`
  - `focusElapsedMs`, `breakElapsedMs`, `breakTargetMs`, `breakCompleted`
  - `focusStartedAt`, `breakStartedAt`, `breakSessionPendingUpdate`
- 세션 버퍼
  - `sessions[]`: `{ sessionFocusSeconds, breakSeconds, clientSessionId? }`

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
{ "title": "string", "note": "string|null", "isDone": true, "date": "2026-01-10", "miniDay": 0, "dayOrder": 3, "timerMode": "stopwatch" }
```
- Validation:
  - `title`: 전달 시 1~200자
  - `note`: 전달 시 string 또는 null
  - `isDone`: 전달 시 boolean
  - `date`: 전달 시 `YYYY-MM-DD`
  - `miniDay`: 전달 시 0~3
  - `dayOrder`: 전달 시 0 이상 정수
  - `timerMode`: 전달 시 `stopwatch | pomodoro | null`
- Note:
  - `PATCH /api/todos/{id}`는 부분 업데이트이며, 전달한 필드만 변경한다.
  - `sessionCount`, `sessionFocusSeconds`는 Session API로만 변경한다.
  - 날짜 이동 계열은 보통 `{ "date": "2026-01-10", "dayOrder": 3 }` 형태로 사용한다.
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

### 2.6 Todo Date Action Policy
- 이동 계열: `날짜 바꾸기`, `오늘하기`, `내일 하기`
  - 기존 Todo를 수정한다.
  - `date`, `dayOrder`만 변경한다.
  - `id`, `note`, `isDone`, `miniDay`, `sessionCount`, `sessionFocusSeconds`, `timerMode`, 세션 기록, 현재 타이머 상태는 유지한다.
- 생성 계열: `오늘 또 하기`, `내일 또 하기`, `다른 날 또 하기`
  - 새 Todo를 생성한다.
  - 원본 완료 Todo는 유지한다.
  - 새 Todo는 `miniDay=0(미분류)`, `isDone=false`, `sessionCount=0`, `sessionFocusSeconds=0`, `timerMode=null`로 시작한다.

### 2.7 Todo Action Visibility
| 상태 | 과거 날짜 | 오늘 날짜 | 미래 날짜 |
| --- | --- | --- | --- |
| 미완료 | `오늘하기`, `날짜 바꾸기` | `내일 하기`, `날짜 바꾸기` | `오늘하기`, `날짜 바꾸기` |
| 완료 | `오늘 또 하기`, `다른 날 또 하기`, `날짜 바꾸기` | `내일 또 하기`, `다른 날 또 하기`, `날짜 바꾸기` | `오늘 또 하기`, `다른 날 또 하기`, `날짜 바꾸기` |

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

## 5. Timer Sync

> `GET /api/timer/sse`는 member access token을 query param으로 전달한다.
> `/api/timer/state/**`는 `Authorization: Bearer {accessJWT}`가 필요한 member 전용 엔드포인트다.

### 5.1 Subscribe Timer SSE
- `GET /api/timer/sse?token={accessToken}`
- Auth: query parameter `token` (member access token)
- Security: Spring Security에서는 `permitAll()`, 컨트롤러에서 token 검증 + role=`member` 확인
- Response 200: `text/event-stream`
- Stream events:

| Event name | Data | 의미 |
|---|---|---|
| `connected` | `ok` | 연결 직후 1회 전송되는 연결 확인 이벤트 |
| `heartbeat` | `keepalive` | 약 25초 간격 keepalive 이벤트 |
| `timer-state` | JSON 문자열 `TimerStateResponse` | 실제 타이머 상태 변경 이벤트 |

- 클라이언트 처리 규칙:
  - `timer-state`만 상태 반영 대상으로 처리한다
  - `connected`, `heartbeat`는 연결 유지용 이벤트로 무시 가능하다
- Error 400: 유효하지 않은 token 또는 member 아님

### 5.2 Push Timer State
- `PUT /api/timer/state/{todoId}`
- Auth: 필요 (회원만)
- Body: `TimerStatePushBody`
- Behavior:
  - `status=idle`이면 `state=null`로 저장하고 soft delete 의미를 갖는다
  - `status!=idle`이면 `state`를 JSON blob으로 저장한다
  - 저장 성공 시 같은 user의 SSE 연결에 `timer-state`를 브로드캐스트한다
- Response 200: `TimerStateResponse`
- Error 404: 해당 user 소유 Todo 아님
- Error 400: `idle`/`state` 조합 불일치 또는 state 직렬화 실패

### 5.3 Get Active Timer States
- `GET /api/timer/state`
- Auth: 필요 (회원만)
- Response 200: `TimerStateResponse[]`
- Behavior:
  - 현재 user의 active timer만 반환한다
  - `state_json IS NULL`인 idle row는 응답에서 제외한다
  - stale row는 TTL cleanup 후 제외될 수 있다

---

## 6. Reviews

> 모든 엔드포인트: `Authorization: Bearer {JWT}` 필요

### 6.1 Get Review (단건)
- `GET /api/reviews?type={type}&periodStart=YYYY-MM-DD`
- `type`: `daily | weekly | monthly`
- Response 200: Review 객체 또는 `null`

### 6.2 List Reviews (기간 목록)
- `GET /api/reviews?type={type}&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Response 200: `{ "items": Review[] }`

### 6.3 Upsert Review
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

### 6.4 Delete Review
- `DELETE /api/reviews/{id}`
- Response 204

---

## 7. Error Format
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
