# Todo-Flow 프론트엔드 테스트 가이드

> 자동화 테스트 결과 + 수동 시나리오 + 버그 리포트를 한 곳에 정리합니다.

## 메타
- 마지막 업데이트: 2026-01-29
- 브랜치: refactor/frontend-cleanup
- 환경: Frontend MVP (MSW 모킹)
- Node: 22.12.0 (`.nvmrc` 기준)

---

## 🤖 자동화 테스트 결과 (2026-01-29)
- `pnpm lint` ✅
- `pnpm test` ✅ (총 9개: timerStore 7, api 2)
- `pnpm build` ✅

### 실행 방법
```
cd frontend
pnpm install
pnpm lint
pnpm test
pnpm build
```

---

## ✅ 수동 테스트 준비
1. 모킹 서버 실행
```
cd frontend
pnpm dev:mock
```
2. 브라우저 접속: `http://localhost:5173`
3. (선택) localStorage 초기화
   - DevTools → Application → Local Storage → `todo-flow/*` 제거

---

## 🧭 오늘 실행할 통합 시나리오 (처음부터 끝까지)

### 시나리오 A: 뽀모도로 전체 흐름
**목적**: 설정 반영 → Flow/Break 전환 → 완료 기록 → 통계 반영
```
1. 설정 페이지에서 값 단축
   - flowMin=1, breakMin=1, longBreakMin=1, cycleEvery=1
   - autoStartBreak/autoStartSession OFF
2. /todos 이동 → Todo A 생성(메모 포함)
3. A에서 타이머 열기 → 뽀모도로 시작
4. Flow 종료 → 휴식 진입 확인 → 1분 휴식 후 "집중 시작"
5. Flow 1분 진행 후 "완료"
6. A 완료 처리(체크박스)
7. /stats 이동 → 통계/모드 통계 확인
```
**체크리스트**
- [ ] 설정 값이 즉시 반영됨
- [ ] Flow 1회 이상 기록됨 (pomodoroDone 증가)
- [ ] 완료 스타일 및 누적 시간 표시 정상
- [ ] 통계의 총 태스크/완료 태스크/모드 통계 일관

---

### 시나리오 B: 일반 타이머 + 휴식 플로우
**목적**: sessionHistory 기록/휴식 추천/완료 처리
```
1. Todo B 생성
2. B에서 일반 타이머 시작
3. 1분 집중 → "휴식" 클릭 → 추천 휴식 선택
4. 1분 휴식 → "집중 시작" → 1분 집중
5. "완료" 클릭
6. /stats 이동 → 세션/집중/휴식 기록 확인
```
**체크리스트**
- [ ] sessionHistory에 focus/break 기록 존재
- [ ] 휴식 추천이 현재 세션 기준으로 계산됨
- [ ] 통계 페이지에 세션 상세가 정상 표시됨

---

### 시나리오 C: 충돌/복원/삭제 흐름
**목적**: 타이머 충돌 방지, 복원 정확도, 삭제 후 정리
```
1. Todo C/D 생성
2. C에서 타이머 실행 중 D에서 타이머 시도 → 충돌 메시지 확인
3. C 타이머 실행 상태에서 새로고침
4. 복원된 상태에서 시간 오차 확인(±5~10초)
5. C 또는 D 삭제 → 타이머/통계가 즉시 갱신되는지 확인
```
**체크리스트**
- [ ] 충돌 메시지 정상 노출
- [ ] 새로고침 후 타이머 상태/시간 정확
- [ ] 삭제 시 sessionHistory/타이머 상태 정리됨

---

## 🔎 우선순위별 수동 테스트 요약

### P0 (Critical)
- SessionHistory 중복/누락
- InitialFocusMs 동기화
- 타이머 복원 정확도
- 휴식 없이 완료해도 Flow 인정
- 추천 휴식 시간 계산

### P1 (High)
- 타이머 상태 전이 (waiting/running)
- 타이머 충돌 처리
- 완료/미완료 전환 시 타이머 상태 유지

### P2 (Medium)
- 통계 페이지 상세/요약 표시
- UI/UX 경계 케이스 (빈 상태, 긴 텍스트, 다중 라인 메모)

---

## 🐛 버그 리포트 템플릿
```markdown
### 버그 제목
- **위치**: 파일명 및 라인 번호
- **재현 단계**:
  1.
  2.
  3.
- **예상 동작**:
- **실제 동작**:
- **우선순위**: Critical / High / Medium / Low
- **스크린샷/로그**: (선택)
```

---

## 📌 참고
- MIN_FLOW_MS: 현재 1분(60,000ms)
- localStorage 키
  - 타이머 상태: `todo-flow/timer/v2/{todoId}`
  - 세션 히스토리: `todo-flow/sessionHistory/{todoId}`
  - MSW Todos/Settings: `todo-flow/todos`, `todo-flow/settings`
