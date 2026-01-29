# SessionHistory 개선 및 통일 방안

## 배경

과거에는 `sessionHistory`가 클라이언트 `sessionStorage`에만 저장되어 브라우저를 닫으면 사라졌습니다. 현재는 `localStorage` 영구 저장으로 개선되었으며(2026-01-22), 뽀모도로/일반 타이머의 기록 로직도 `updateSessionHistory()` 경로로 통일되었습니다.

## 현재 방식 요약

### 데이터 저장
- **sessionHistory**: 클라이언트 `localStorage`에 저장
- **focusSeconds, pomodoroDone**: DB에 저장 (누적값)
- **통계 계산**: `sessionHistory` 우선, 없으면 `focusSeconds` 사용

### 기록 시점
- **뽀모도로**: Flow/Break 완료 시 자동 기록
- **일반 타이머**: 휴식 시작/완료 시 명시적 기록

### 데이터 구조
```typescript
type SessionRecord = {
  focusMs: number    // 집중 시간 (밀리초)
  breakMs: number   // 휴식 시간 (밀리초)
}
```

---

## 현재 방식 분석

### 장점

#### 1. 빠른 개발 및 MVP 적합
- ✅ DB 스키마 변경 없이 빠르게 구현 가능
- ✅ 통계 기능을 먼저 검증 가능
- ✅ 클라이언트에서 즉시 사용 가능

#### 2. 하위 호환성 유지
- ✅ 기존 `focusSeconds`와 병행 사용
- ✅ `sessionHistory` 없어도 동작
- ✅ 점진적 마이그레이션 가능

#### 3. 실시간 통계 제공
- ✅ 세션별 상세 정보 즉시 표시
- ✅ 진행 중인 세션도 통계에 반영
- ✅ 사용자 경험 향상

#### 4. 클라이언트 중심 설계
- ✅ 타이머 상태는 클라이언트에서 관리 (정확도)
- ✅ 서버는 최종 결과만 저장 (단순성)

---

### 이전 문제(해결됨)

#### 1. 데이터 영속성 문제 ⚠️
**문제:**
- 브라우저를 닫으면 `sessionHistory` 사라짐 (과거)
- 다른 기기에서 접속 시 데이터 없음
- 시크릿 모드에서는 사용 불가

**영향:**
- 통계 페이지의 세션 상세 정보가 사라짐
- 장기간 사용 시 데이터 손실
- 멀티 디바이스 사용 불가

#### 2. 데이터 일관성 문제 ⚠️
**문제:**
- `sessionHistory`와 `focusSeconds`가 불일치할 수 있음
- 클라이언트에서만 `sessionHistory` 관리
- 서버는 `focusSeconds`만 알고 있음

**시나리오:**
```
1. 사용자가 3개 세션 완료 (sessionHistory: [5분, 10분, 15분])
2. 브라우저를 닫음 → sessionHistory 사라짐
3. 다시 접속 → 통계는 focusSeconds(30분)만 표시
4. 세션별 상세 정보는 사라짐
```

#### 3. 중복 저장 및 동기화 복잡도
**문제:**
- (과거) `sessionHistory`는 `sessionStorage`에 저장
- `focusSeconds`는 DB에 저장
- 두 데이터가 따로 관리됨

**복잡도:**
- 완료 시 두 곳 모두 업데이트 필요
- 동기화 실패 시 불일치 발생 가능
- 복원 로직이 복잡해짐

#### 4. 로직 분산 및 불일치 ⚠️
**문제:**
- `sessionHistory` 업데이트가 여러 곳에 분산
- 뽀모도로와 일반 타이머 로직이 다름
- 코드 중복 및 유지보수 어려움

**현재 분산 위치:**
```typescript
// 위치 1: timerStore.ts - completePhase (뽀모도로)
transitionPhase(..., (currentHistory) => [...currentHistory, { focusMs, breakMs: 0 }])

// 위치 2: timerStore.ts - skipToNext (뽀모도로)
transitionPhase(..., (currentHistory) => [...currentHistory, { focusMs, breakMs: 0 }])

// 위치 3: timerStore.ts - startBreak (일반 타이머)
if (currentSessionMs >= MIN_FLOW_MS) {
  newSessionHistory.push({ focusMs: currentSessionMs, breakMs: 0 })
}

// 위치 4: timerStore.ts - resumeFocus (일반 타이머)
newSessionHistory[newSessionHistory.length - 1] = { ..., breakMs: newBreakElapsed }

// 위치 5: TimerFullScreen.tsx - handleStopwatchComplete (과거) ⚠️
// useTimerStore.setState(...) // 직접 store 업데이트 (현재는 제거됨)
```

**로직 불일치:**
- **뽀모도로**: 항상 Flow 완료 시 기록 (고정 시간)
- **일반 타이머**: MIN_FLOW_MS 이상일 때만 기록 (가변 시간)
- **Break 업데이트**: 뽀모도로는 transitionPhase 콜백, 일반 타이머는 직접 업데이트

#### 5. 관심사 분리 위반 (해결됨)
- `TimerFullScreen`에서 직접 store 업데이트 제거
- `updateSessionHistory()` 경로로 세션 관리 통일

#### 6. 통계 정확도 문제
**문제:**
- `sessionHistory`가 없으면 `focusSeconds` 사용
- `focusSeconds`는 누적값이라 세션별 정보 없음
- 세션별 상세 통계 불가능

---

## 개선 방안

### Phase 1: 로직 통일 (프론트엔드)

#### 1. 세션 관리 전용 헬퍼 함수 생성

```typescript
// frontend/src/features/timer/sessionHelpers.ts

import type { SessionRecord } from './timerStore'
import { MIN_FLOW_MS } from '../../lib/constants'

/**
 * 세션 추가 (Flow 완료 시)
 */
export function addSession(
  currentHistory: SessionRecord[],
  focusMs: number,
  breakMs: number = 0,
  minFlowMs: number = MIN_FLOW_MS
): SessionRecord[] {
  // 일반 타이머: MIN_FLOW_MS 이상만 추가
  // 뽀모도로: 항상 추가 (minFlowMs를 0으로 전달)
  if (focusMs < minFlowMs) {
    return currentHistory
  }
  
  return [...currentHistory, { focusMs, breakMs }]
}

/**
 * 마지막 세션의 Break 시간 업데이트
 */
export function updateLastSessionBreak(
  currentHistory: SessionRecord[],
  breakMs: number
): SessionRecord[] {
  if (currentHistory.length === 0) {
    return currentHistory
  }
  
  const updated = [...currentHistory]
  updated[updated.length - 1] = {
    ...updated[updated.length - 1],
    breakMs
  }
  return updated
}

/**
 * 세션 계산 헬퍼
 */
export function calculateSessionTotals(history: SessionRecord[]) {
  const totalFocusMs = history.reduce((sum, s) => sum + s.focusMs, 0)
  const totalBreakMs = history.reduce((sum, s) => sum + s.breakMs, 0)
  const totalElapsedMs = totalFocusMs + totalBreakMs
  
  return {
    totalFocusMs,
    totalBreakMs,
    totalElapsedMs,
    sessionCount: history.length
  }
}

/**
 * 세션 검증
 */
export function validateSession(session: SessionRecord): boolean {
  return session.focusMs >= 0 && session.breakMs >= 0
}

/**
 * 유효한 세션만 필터링
 */
export function filterValidSessions(
  history: SessionRecord[],
  minFlowMs: number = MIN_FLOW_MS
): SessionRecord[] {
  return history.filter(s => s.focusMs >= minFlowMs)
}
```

#### 2. timerStore에 통일된 메서드 추가

```typescript
// timerStore.ts에 추가

type TimerActions = {
  // ... 기존 액션들
  
  // 세션 관리 (통일된 인터페이스)
  addSession: (todoId: string, focusMs: number, breakMs?: number) => void
  updateLastSessionBreak: (todoId: string, breakMs: number) => void
  getSessionTotals: (todoId: string) => { totalFocusMs: number; totalBreakMs: number; sessionCount: number } | null
}

// 구현
addSession: (todoId, focusMs, breakMs = 0) => {
  const timer = get().timers[todoId]
  if (!timer) return
  
  // 일반 타이머: MIN_FLOW_MS 체크
  // 뽀모도로: 항상 추가 (minFlowMs = 0)
  const minFlowMs = timer.mode === 'stopwatch' ? MIN_FLOW_MS : 0
  const newHistory = addSession(timer.sessionHistory, focusMs, breakMs, minFlowMs)
  
  updateTimer(todoId, { sessionHistory: newHistory })
},

updateLastSessionBreak: (todoId, breakMs) => {
  const timer = get().timers[todoId]
  if (!timer) return
  
  const newHistory = updateLastSessionBreak(timer.sessionHistory, breakMs)
  updateTimer(todoId, { sessionHistory: newHistory })
},

getSessionTotals: (todoId) => {
  const timer = get().timers[todoId]
  if (!timer) return null
  
  return calculateSessionTotals(timer.sessionHistory)
}
```

#### 3. 뽀모도로 로직 통일

```typescript
// timerStore.ts - completePhase 수정

completePhase: (todoId) => {
  const timer = get().timers[todoId]
  if (!timer || timer.mode !== 'pomodoro' || !timer.settingsSnapshot) return
  // ... 기존 검증 로직
  
  const { phase, cycleCount, settingsSnapshot } = timer
  const { cycleEvery, breakMin, longBreakMin, flowMin, autoStartBreak, autoStartSession } = settingsSnapshot
  
  if (phase === 'flow') {
    // Flow 완료 시 세션 추가
    const plannedMs = flowMin * MINUTE
    const actualElapsedMs = timer.endAt 
      ? Math.max(0, plannedMs - Math.max(0, timer.endAt - Date.now()))
      : plannedMs
    const flowMs = Math.max(0, actualElapsedMs)
    
    // 통일된 세션 추가 메서드 사용
    get().addSession(todoId, flowMs, 0)
    
    const nextCycle = cycleCount + 1
    const breakType = getBreakType(nextCycle, cycleEvery)
    const breakDuration = breakType.isLong ? longBreakMin : breakMin
    
    transitionPhase(todoId, breakType.phase, breakDuration, autoStartBreak ?? false, 1)
  } else {
    // Break 완료 시 마지막 세션의 breakMs 업데이트
    const breakMs = (phase === 'long' ? longBreakMin : breakMin) * MINUTE
    const cycleCountDelta = phase === 'long' ? -cycleCount : 0
    
    // 통일된 세션 업데이트 메서드 사용
    get().updateLastSessionBreak(todoId, breakMs)
    
    transitionPhase(todoId, 'flow', flowMin, autoStartSession ?? false, cycleCountDelta)
  }
}
```

#### 4. 일반 타이머 로직 통일

```typescript
// timerStore.ts - startBreak 수정

startBreak: (todoId, targetMs) => {
  const timer = get().timers[todoId]
  if (!timer || timer.mode !== 'stopwatch') return
  if (timer.flexiblePhase !== 'focus') return
  
  // 집중 시간 계산
  let newFocusElapsed = timer.focusElapsedMs
  if (timer.status === 'running' && timer.focusStartedAt) {
    const delta = Date.now() - timer.focusStartedAt
    newFocusElapsed = timer.focusElapsedMs + delta
  }
  
  const initialMs = timer.initialFocusMs ?? 0
  const currentSessionMs = newFocusElapsed - initialMs
  
  // 통일된 세션 추가 메서드 사용
  get().addSession(todoId, currentSessionMs, 0)
  
  // ... 나머지 로직
}

// timerStore.ts - resumeFocus 수정

resumeFocus: (todoId) => {
  const timer = get().timers[todoId]
  if (!timer || timer.mode !== 'stopwatch') return
  if (timer.flexiblePhase !== 'break_suggested' && timer.flexiblePhase !== 'break_free') return
  
  // 휴식 시간 계산
  let newBreakElapsed = timer.breakElapsedMs
  if (timer.breakStartedAt) {
    const delta = Date.now() - timer.breakStartedAt
    newBreakElapsed = timer.breakElapsedMs + delta
  }
  
  // 통일된 세션 업데이트 메서드 사용
  get().updateLastSessionBreak(todoId, newBreakElapsed)
  
  // ... 나머지 로직
}
```

#### 5. TimerFullScreen에서 직접 업데이트 제거

```typescript
// TimerFullScreen.tsx - handleStopwatchComplete 수정

const handleStopwatchComplete = async () => {
  if (!timer) return
  
  // pause 먼저 호출
  if (timer.status === 'running') {
    pause(todoId)
    const pausedTimer = getTimer(todoId)
    if (!pausedTimer) return
    Object.assign(timer, pausedTimer)
  }
  
  // 현재 세션 계산
  const currentFocusMs = timer.focusElapsedMs ?? timer.elapsedMs
  const initialMs = timer.initialFocusMs ?? 0
  const currentSessionMs = currentFocusMs - initialMs
  
  let currentBreakMs = timer.breakElapsedMs ?? 0
  if (timer.breakStartedAt && (timer.flexiblePhase === 'break_suggested' || timer.flexiblePhase === 'break_free')) {
    const delta = Date.now() - timer.breakStartedAt
    currentBreakMs = timer.breakElapsedMs + delta
  }
  
  // 통일된 메서드 사용 (직접 업데이트 제거)
  const addSession = useTimerStore((s) => s.addSession)
  const updateLastSessionBreak = useTimerStore((s) => s.updateLastSessionBreak)
  
  if (timer.flexiblePhase === 'focus' || !timer.flexiblePhase) {
    // 집중 중: 세션 추가
    if (currentSessionMs >= MIN_FLOW_MS) {
      addSession(todoId, currentSessionMs, 0)
    }
  } else {
    // 휴식 중: 마지막 세션의 breakMs 업데이트
    updateLastSessionBreak(todoId, currentBreakMs)
  }
  
  // ... API 호출 로직
}
```

---

### Phase 2: 데이터 영속성 개선

#### 1. localStorage로 전환 (즉시 개선)

```typescript
// sessionStorage → localStorage
// 브라우저를 닫아도 유지 (단, 다른 기기는 여전히 불가)
localStorage.setItem(key, JSON.stringify(state))
```

**장점:**
- 구현 간단
- 브라우저 닫아도 유지

**단점:**
- 여전히 클라이언트에만 저장
- 다른 기기 접근 불가

#### 2. DB 저장 구현 (중기 개선)

##### 설계 옵션

**옵션 1: 별도 테이블 (추천)**

**장점:**
- 정규화된 구조
- 세션별 쿼리/필터링 용이
- 확장성 좋음 (나중에 세션별 메타데이터 추가 가능)
- 성능: 인덱스 활용 가능

**단점:**
- 조인 필요
- 테이블 수 증가

**구조:**
```sql
CREATE TABLE todo_sessions (
  id UUID PRIMARY KEY,
  todo_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  focus_seconds INT NOT NULL,  -- 집중 시간 (초)
  break_seconds INT NOT NULL,   -- 휴식 시간 (초)
  session_order INT NOT NULL,   -- 세션 순서 (1, 2, 3...)
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  INDEX idx_todo_sessions_todo_id (todo_id),
  INDEX idx_todo_sessions_user_id (user_id)
);
```

**엔티티:**
```java
@Entity
@Table(name = "todo_sessions")
public class TodoSession {
  @Id
  @GeneratedValue(strategy = GenerationType.UUID)
  private UUID id;
  
  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "todo_id", nullable = false)
  private Todo todo;
  
  @Column(name = "user_id", nullable = false)
  private String userId;
  
  @Column(name = "focus_seconds", nullable = false)
  private Integer focusSeconds;
  
  @Column(name = "break_seconds", nullable = false)
  private Integer breakSeconds;
  
  @Column(name = "session_order", nullable = false)
  private Integer sessionOrder;
  
  @CreatedDate
  @Column(name = "created_at", nullable = false)
  private LocalDateTime createdAt;
  
  @LastModifiedDate
  @Column(name = "updated_at", nullable = false)
  private LocalDateTime updatedAt;
}
```

**옵션 2: JSON 컬럼 (간단)**

**장점:**
- 구현 간단
- 조인 불필요
- Todo 조회 시 함께 로드

**단점:**
- JSON 파싱 필요
- 세션별 쿼리 어려움
- 확장성 제한

**구조:**
```sql
ALTER TABLE todos 
ADD COLUMN session_history JSON;
```

##### API 설계

**기존 API 활용:**
- `POST /api/todos/{id}/pomodoro/complete` - 뽀모도로 완료 시 세션 추가
- `POST /api/todos/{id}/focus/add` - 일반 타이머 시간 추가 시 세션 추가

**Response에 sessionHistory 포함:**
```json
{
  "id": "uuid",
  "title": "string",
  "pomodoroDone": 3,
  "focusSeconds": 4500,
  "sessionHistory": [
    { "focusMs": 1500000, "breakMs": 300000 },
    { "focusMs": 1500000, "breakMs": 300000 },
    { "focusMs": 1500000, "breakMs": 0 }
  ]
}
```

##### 마이그레이션 전략

**V2 마이그레이션:**
1. `todo_sessions` 테이블 생성
2. 기존 `focusSeconds`는 유지 (하위 호환성)
3. 새 세션부터 `todo_sessions`에 저장
4. 프론트엔드: `sessionHistory`가 있으면 우선 사용, 없으면 `focusSeconds` 사용 (현재 로직 유지)

**데이터 이관 (선택):**
- 기존 데이터는 `focusSeconds`로 유지
- 새 세션부터 `todo_sessions`에 저장
- 통계는 `sessionHistory` 우선, 없으면 `focusSeconds` 사용

---

## 개선 효과

### 1. 코드 중복 제거
- ✅ 세션 추가/업데이트 로직이 한 곳에 집중
- ✅ 뽀모도로와 일반 타이머 동일한 인터페이스 사용

### 2. 관심사 분리
- ✅ UI 컴포넌트에서 직접 store 업데이트 제거
- ✅ 세션 관리 로직이 store에 집중

### 3. 유지보수성 향상
- ✅ 세션 로직 변경 시 한 곳만 수정
- ✅ 테스트 용이 (헬퍼 함수 단위 테스트)

### 4. 타입 안정성
- ✅ 세션 관련 타입이 한 곳에 정의
- ✅ 잘못된 사용 방지

### 5. 데이터 영속성
- ✅ DB 저장으로 브라우저 닫아도 유지
- ✅ 멀티 디바이스 지원 가능

---

## 구현 순서

### Phase 1: 로직 통일 (프론트엔드) - 4-5시간

#### Step 1: 헬퍼 함수 생성 (30분)
- [ ] `sessionHelpers.ts` 파일 생성
- [ ] `addSession`, `updateLastSessionBreak`, `calculateSessionTotals` 구현
- [ ] 테스트 작성

#### Step 2: timerStore에 메서드 추가 (1시간)
- [ ] `addSession`, `updateLastSessionBreak`, `getSessionTotals` 추가
- [ ] 기존 로직을 새 메서드로 교체

#### Step 3: 뽀모도로 로직 통일 (1시간)
- [ ] `completePhase` 수정
- [ ] `skipToNext` 수정
- [ ] `transitionPhase`의 sessionHistoryUpdate 콜백 제거

#### Step 4: 일반 타이머 로직 통일 (1시간)
- [ ] `startBreak` 수정
- [ ] `resumeFocus` 수정
- [ ] `handleStopwatchComplete` 수정 (직접 업데이트 제거)

#### Step 5: 테스트 및 검증 (1시간)
- [ ] 통합 테스트
- [ ] 수동 테스트
- [ ] 리팩토링 검증

### Phase 2: 데이터 영속성 (백엔드) - 1주

#### Step 1: 즉시 개선 (1-2일)
- [ ] localStorage로 전환
- [ ] 에러 핸들링 강화

#### Step 2: DB 저장 구현 (1주)
- [ ] `TodoSession` 엔티티 생성
- [ ] `TodoSessionRepository` 생성
- [ ] `TodoService`에 세션 저장 로직 추가
- [ ] `TodoResponse`에 `sessionHistory` 필드 추가
- [ ] Flyway V2 마이그레이션 파일 생성
- [ ] API 확장 (세션 저장/조회)
- [ ] 프론트엔드 동기화 로직

---

## 결론

### 현재 방식 평가
- **MVP 단계**: ✅ 적합 (빠른 개발, 검증 가능)
- **프로덕션**: ⚠️ 부적합 (데이터 영속성 문제, 로직 분산)

### 권장 사항
1. **즉시**: 로직 통일 (코드 품질 향상)
2. **단기**: localStorage로 전환 (간단한 개선)
3. **중기**: DB 저장 구현 (데이터 영속성)

### 핵심 원칙
- ✅ **하위 호환성 유지**: 기존 `focusSeconds`와 병행
- ✅ **점진적 마이그레이션**: 단계적 개선
- ✅ **사용자 경험 우선**: 데이터 손실 최소화
- ✅ **코드 통일성**: 뽀모도로와 일반 타이머 동일한 인터페이스
