# FlowMate Manual API Test Scenarios (전 API)

## 1. 목적
- FlowMate 백엔드 API 전체를 수동으로 검증하기 위한 체크리스트
- 기준 문서:
  - `/Users/glenn/projects/FlowMate/docs/plan/api.md`
  - `/Users/glenn/projects/FlowMate/docs/plan/data.md`

## 2. 사전 준비
1. 백엔드 실행
```bash
cd /Users/glenn/projects/FlowMate/backend
./gradlew bootRun --args='--spring.profiles.active=local'
```
2. 공통 헤더 값 준비
- `X-Client-Id: manual-user-1`
3. 공통 변수
- `BASE_URL=http://localhost:8080/api`
- `DATE=2026-02-06`

## 3. 공통 검증 규칙
- 정상: 2xx + 응답 JSON 스키마 일치
- 입력 오류: 400 + `{ "error": { "code", "message", "fields" } }`
- 미존재 리소스: 404
- 생성: 201, 삭제: 204

---

## 4. Todo API

### T1. Todo 생성
```bash
curl -i -X POST "$BASE_URL/todos" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"title":"todo-a","date":"2026-02-06","miniDay":0}'
```
기대:
- 201
- body에 `id`, `title`, `isDone=false`, `sessionCount=0`, `sessionFocusSeconds=0`, `timerMode=null`

### T2. Todo 전체 조회
```bash
curl -i "$BASE_URL/todos" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `{ "items": [...] }`

### T3. Todo 날짜 필터 조회
```bash
curl -i "$BASE_URL/todos?date=2026-02-06" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- 해당 날짜 Todo만 포함

### T4. Todo PATCH (title/note/isDone/timerMode)
```bash
curl -i -X PATCH "$BASE_URL/todos/{todoId}" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"title":"todo-a-updated","note":"memo","isDone":false,"timerMode":"stopwatch"}'
```
기대:
- 200
- 변경 필드 반영
- `isDone` 키 존재(중요)

### T5. Todo PATCH nullable clear
```bash
curl -i -X PATCH "$BASE_URL/todos/{todoId}" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"note":null,"timerMode":null}'
```
기대:
- 200
- `note=null`, `timerMode=null`

### T6. Todo reorder
```bash
curl -i -X PUT "$BASE_URL/todos/reorder" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"items":[{"id":"{todoId}","dayOrder":3,"miniDay":1}]}'
```
기대:
- 200
- 반환된 `items`에서 `dayOrder`, `miniDay` 반영

### T7. Todo 삭제
```bash
curl -i -X DELETE "$BASE_URL/todos/{todoId}" -H 'X-Client-Id: manual-user-1'
```
기대:
- 204
- 재조회 시 목록에서 사라짐

---

## 5. Session API

### S1. Session 생성
```bash
curl -i -X POST "$BASE_URL/todos/{todoId}/sessions" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"sessionFocusSeconds":120,"breakSeconds":30}'
```
기대:
- 201
- `sessionOrder` 반환
- Todo 집계(`sessionCount`, `sessionFocusSeconds`) 증가

### S2. Session 목록 조회
```bash
curl -i "$BASE_URL/todos/{todoId}/sessions" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `items` 오름차순(`sessionOrder`)

### S3. Session 전체 삭제
```bash
curl -i -X DELETE "$BASE_URL/todos/{todoId}/sessions" -H 'X-Client-Id: manual-user-1'
```
기대:
- 204
- 세션 목록 0건
- Todo 집계는 reset 전까지 유지

### S4. Timer reset
```bash
curl -i -X POST "$BASE_URL/todos/{todoId}/reset" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' -d '{}'
```
기대:
- 200
- `sessionCount=0`, `sessionFocusSeconds=0`, `timerMode=null`
- 세션 목록도 0건

---

## 6. Settings API

### G1. 통합 설정 조회
```bash
curl -i "$BASE_URL/settings" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `pomodoroSession`, `automation`, `miniDays` 모두 존재

### G2. pomodoro-session 조회
```bash
curl -i "$BASE_URL/settings/pomodoro-session" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `flowMin/breakMin/longBreakMin/cycleEvery`

### G3. pomodoro-session 수정
```bash
curl -i -X PUT "$BASE_URL/settings/pomodoro-session" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"flowMin":30,"breakMin":6,"longBreakMin":16,"cycleEvery":5}'
```
기대:
- 200
- 수정값 반영

### G4. automation 조회
```bash
curl -i "$BASE_URL/settings/automation" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `autoStartBreak`, `autoStartSession`

### G5. automation 수정
```bash
curl -i -X PUT "$BASE_URL/settings/automation" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"autoStartBreak":true,"autoStartSession":false}'
```
기대:
- 200
- 값 반영

### G6. mini-days 조회
```bash
curl -i "$BASE_URL/settings/mini-days" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `day1/day2/day3` 구조

### G7. mini-days 수정
```bash
curl -i -X PUT "$BASE_URL/settings/mini-days" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{
    "day1":{"label":"Morning","start":"06:00","end":"11:00"},
    "day2":{"label":"Afternoon","start":"12:00","end":"17:00"},
    "day3":{"label":"Evening","start":"18:00","end":"24:00"}
  }'
```
기대:
- 200
- 라벨/시간 반영

---

## 7. Review API

### R1. Review upsert
```bash
curl -i -X PUT "$BASE_URL/reviews" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"type":"daily","periodStart":"2026-02-06","periodEnd":"2026-02-06","content":"good"}'
```
기대:
- 200
- `id` 포함

### R2. Review 단건 조회
```bash
curl -i "$BASE_URL/reviews?type=daily&periodStart=2026-02-06" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- 존재하면 객체, 없으면 `null`

### R3. Review 목록 조회
```bash
curl -i "$BASE_URL/reviews?type=daily&from=2026-02-01&to=2026-02-28" -H 'X-Client-Id: manual-user-1'
```
기대:
- 200
- `{ "items": [...] }`

### R4. Review 삭제
```bash
curl -i -X DELETE "$BASE_URL/reviews/{reviewId}" -H 'X-Client-Id: manual-user-1'
```
기대:
- 204
- 단건 재조회 시 `null`

---

## 8. 공통 에러 시나리오

### E1. 헤더 누락
```bash
curl -i "$BASE_URL/todos"
```
기대:
- 400
- `error.code = BAD_REQUEST`

### E2. Validation 실패 (title 빈값)
```bash
curl -i -X POST "$BASE_URL/todos" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"title":""}'
```
기대:
- 400
- `error.code = VALIDATION_ERROR`

### E3. Not Found
```bash
curl -i -X PATCH "$BASE_URL/todos/00000000-0000-0000-0000-000000000000" \
  -H 'X-Client-Id: manual-user-1' -H 'Content-Type: application/json' \
  -d '{"title":"x"}'
```
기대:
- 404
- `error.code = NOT_FOUND`

---

## 9. 최종 통과 체크리스트
- [ ] Todo CRUD + reorder 정상
- [ ] Session 생성/조회/삭제 + reset 정상
- [ ] Settings 통합/섹션 조회/수정 정상
- [ ] Review upsert/get/list/delete 정상
- [ ] 모든 에러 포맷 일관
- [ ] 프론트 콘솔 Zod 에러 없음

## 10. 참고
- H2 콘솔: `http://localhost:8080/h2-console/`
- JDBC URL: `jdbc:h2:mem:flowmate;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE`
- User: `sa`, Password: 빈값
