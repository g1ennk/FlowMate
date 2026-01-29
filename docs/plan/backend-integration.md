# Backend Integration Plan

## 목표
- 프론트 타이머는 **클라이언트에서 실행**하고, 서버는 **결과 누적**만 담당한다.
- API 계약을 고정하여 프론트/백엔드가 병렬 개발 가능하도록 한다.
- 세션 히스토리는 **로컬 저장**을 유지하되, 추후 DB 이관 경로를 마련한다.

## 1. API 계약 (필수)
Base URL: `/api`

### Todos
- `GET /api/todos` → `{ items: Todo[] }`
- `POST /api/todos` → `Todo`
- `PATCH /api/todos/:id` → `Todo`
- `PUT /api/todos/reorder` → `{ items: Todo[] }`
- `DELETE /api/todos/:id` → `204`

### Timer Completion
- `POST /api/todos/:id/pomodoro/complete` → `{ id, pomodoroDone, focusSeconds, updatedAt }`
- `POST /api/todos/:id/focus/add` → `{ id, focusSeconds, updatedAt }`
- `POST /api/todos/:id/reset` → `{ id, focusSeconds, pomodoroDone, updatedAt }`

### Settings
- `GET /api/settings/pomodoro` → `PomodoroSettings`
- `PUT /api/settings/pomodoro` → `PomodoroSettings`

### Error Format
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": { "field": "msg" } } }
```

## 2. 데이터 동기화 전략
### 소스 오브 트루스
- `Todo`, `PomodoroSettings`: 서버가 소스 오브 트루스.
- `timerState`, `sessionHistory`: 클라이언트(localStorage) 유지.

### timerMode 동기화
- **타이머 시작/모드 선택 시** `PATCH /api/todos/:id`로 `timerMode` 저장.
- 완료/누적 API는 `timerMode`를 변경하지 않음.

### 충돌/복원
- 앱 시작 시:
  1) Todos/Settings API 로드
  2) localStorage의 timer 상태 복원
  3) 삭제된 Todo의 timer/sessionHistory는 정리

## 3. 세션 히스토리(DB 이관) 설계 방향
현재 `sessionHistory`는 로컬 저장.

### 3.1 단계적 이관
1) **1단계**: localStorage 유지
2) **2단계**: `todo_sessions` 테이블 추가
3) **3단계**: 완료/휴식 시 서버에도 세션 기록

### 3.2 제안 스키마
- `todo_sessions`
  - `id (uuid)`
  - `todo_id (uuid)`
  - `user_id (string)`
  - `focus_seconds (int)`
  - `break_seconds (int)`
  - `session_order (int)`
  - `created_at`, `updated_at`

### 3.3 마이그레이션 전략
- 앱 로드 시 localStorage에 세션이 있고 서버에 없으면 **1회 업로드** (옵션)
- 업로드 성공 후 localStorage 유지 (백업)

## 4. 성능/안정성 고려
- 타이머는 클라이언트 단일 실행 모델 유지 (서버 실시간 동기화 없음)
- API 실패 시:
  - 완료 API 실패 → 토스트 + 재시도 (필요 시 큐 도입)
  - 설정 저장 실패 → 로컬 유지 후 재시도

## 5. 체크리스트
- [ ] 백엔드에서 `durationSec` 범위 검증 (1~10800)
- [ ] `timerMode` 저장 정책 일관성 유지
- [ ] 삭제 Todo에 대한 로컬 timer/sessionHistory 정리 로직 유지
- [ ] API 응답 스키마 Zod 검증 통과
