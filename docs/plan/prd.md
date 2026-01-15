# PRD – Todo + Pomodoro Web App (MVP)

## 1. 제품 개요
본 제품은 **Todo 관리 + Pomodoro(Flow) 타이머**를 결합한 웹 애플리케이션이다.  
사용자는 Todo를 생성하고, 각 Todo에서 **Start 버튼을 눌러** 미리 설정된 Pomodoro 타이머를 시작할 수 있다.

본 MVP는 **로그인/멀티유저 없이 단일 로컬 사용자**를 가정하며,  
추후 인증 및 멀티유저 확장이 가능하고 커뮤니티 기능 확장이 가능하도록 구조를 설계한다.

레퍼런스:
- Todo UX: todomate
- Pomodoro UX: flow 앱

## 2. 목표 (Goals)
- Todo를 빠르고 직관적으로 관리할 수 있다
- Todo 단위로 Pomodoro(Flow) 타이머를 실행할 수 있다
- 사용자가 설정한 Flow 시간 / 휴식 시간 / 주기(cycle)를 타이머에 반영한다
- Flow 1회 완료 시 Todo에 **집중 성과가 누적**된다
- MVP 수준에서 **단순하지만 확장 가능한 구조**를 갖는다

## 3. 비목표 (Non-Goals)
다음 기능은 **이번 MVP 범위에서 제외**한다:
- 로그인 / 회원가입 / 멀티유저
- 소셜 기능
- 통계 대시보드
- 일기 / 루틴 / 캘린더
- 서버 기반 실시간 타이머 동기화

## 4. 기술 스택
### Frontend
- Vite + pnpm, React 18 + TypeScript
- React Router (CSR)
- TanStack Query, Zustand (타이머 endAt/phase 저장)
- react-hook-form + zod
- Tailwind CSS, date-fns, clsx
- Vitest + @testing-library/react, ESLint + Prettier
- Timer는 **클라이언트에서 실행**

### Backend
- Spring Boot
- Spring Web
- Spring Data JPA
- DB: MySQL (dev는 H2 가능)
- 마이그레이션: Flyway

> 사용자 개념은 내부적으로 `userId = "local"` 고정값을 사용한다.


## 5. 핵심 사용자 플로우
1. 사용자는 Todo를 생성한다
2. Todo 리스트에서 특정 Todo의 **Start** 버튼을 누른다
3. 시스템은 사용자의 Pomodoro 설정을 불러온다
4. Pomodoro 타이머(Flow)가 시작된다
5. Flow 1회가 완료되면:
   - 해당 Todo의 pomodoroDone이 +1 증가한다
   - focusSeconds가 Flow 시간만큼 누적된다
6. 타이머는 Break → Flow 사이클을 반복한다


## 6. 기능 요구사항

### 6.1 Todo
- Todo 생성 / 수정 / 삭제
- Todo 완료 체크
- 각 Todo는 다음 정보를 가진다:
  - title (필수)
  - note (선택)
  - isDone
  - pomodoroDone (누적)
  - focusSeconds (누적)

### 6.2 타이머

#### 뽀모도로 타이머
- Todo 단위로 실행된다
- 타이머는 다음 phase를 가진다:
  - Flow
  - Short Break
  - Long Break
- 기본 규칙:
  - Flow 완료 → pomodoroDone 증가
  - Flow 완료 횟수가 cycleEvery에 도달하면 Long Break
  - 그 외에는 Short Break
  - 긴 휴식 완료 후 자동으로 사이클 초기화 (`cycleCount = 0`)
- 타이머는 **endAt 기준**으로 시간 계산을 한다
- Pause / Resume / Stop / Reset 지원
- 자동화 설정:
  - `autoStartBreak`: Flow 완료 후 자동으로 Break 시작
  - `autoStartSession`: Break 완료 후 자동으로 Flow 시작

#### 일반 타이머 (Flexible/Flow)
- 카운트업 방식 (00:00부터 시작)
- **Flow 개념**: 3분 이상 집중 + 명시적 행동(휴식/완료)
  - 최소 집중 시간: 3분 (`MIN_FLOW_MS`, 180000ms)
  - 완료된 Flow만 카운트 (`pomodoroDone`)
  - `handleStopwatchComplete`에서 현재 세션만 처리 (중복 카운트 방지)
- **휴식 기능**:
  - "휴식" 버튼 클릭 → 추천 휴식 / 자유 휴식 선택
  - 추천 휴식: 집중 시간의 20% (5~30분 범위, 카운트다운)
  - 자유 휴식: 무제한 카운트업
- **세션 히스토리**:
  - 각 세션의 집중 시간과 휴식 시간 저장
  - 휴식 시작 시 현재 집중 시간 저장
  - 집중 재개 시 마지막 세션의 휴식 시간 업데이트
  - 집중 재개 후 새로운 세션 시작 (0부터 카운트업)
- Pause / Resume / Stop / Reset 지원
- 자동화 설정 적용: 뽀모도로 설정의 `autoStartBreak`, `autoStartSession` 따름

### 6.3 Settings (Pomodoro 설정)
사용자는 다음 값을 설정할 수 있다:
- flowMin (집중 시간, 분)
- breakMin (짧은 휴식 시간, 분)
- longBreakMin (긴 휴식 시간, 분)
- cycleEvery (몇 번의 Flow마다 긴 휴식)
- autoStartBreak (Flow 완료 후 자동으로 Break 시작)
- autoStartSession (Break 완료 후 자동으로 Flow 시작)

기본값:
- flowMin: 25
- breakMin: 5
- longBreakMin: 15
- cycleEvery: 4
- autoStartBreak: false
- autoStartSession: false

검증 규칙:
- flowMin: 1 ~ 180
- breakMin: 1 ~ 60
- longBreakMin: 1 ~ 120
- cycleEvery: 1 ~ 12
- autoStartBreak: boolean
- autoStartSession: boolean

**참고**: 일반 타이머도 이 설정의 자동화 옵션을 따릅니다.


## 7. 데이터 모델

### Todo
- id (UUID)
- userId ("local")
- title
- note
- isDone
- pomodoroDone
- focusSeconds
- timerMode ('stopwatch' | 'pomodoro' | null) - 선택된 타이머 타입
- createdAt
- updatedAt

### PomodoroSettings
- userId (PK, "local")
- flowMin
- breakMin
- longBreakMin
- cycleEvery


## 8. API 요구사항

### Todo
- GET /api/todos
- POST /api/todos
- PATCH /api/todos/{id}
- DELETE /api/todos/{id}

### Pomodoro Settings
- GET /api/settings/pomodoro
- PUT /api/settings/pomodoro

### Pomodoro 완료 누적
- POST /api/todos/{id}/pomodoro/complete
  - request body:
    ```json
    {
      "durationSec": number
    }
    ```
  - 서버 동작:
    - pomodoroDone += 1
    - focusSeconds += durationSec


## 9. UI 구성

### Pages
- /todos
  - Todo 리스트
  - 각 Todo에 Start 버튼
- /settings/pomodoro
  - Pomodoro 설정 화면
- /timer (또는 modal)
  - 현재 Todo + 타이머 UI


## 10. 기술적 결정 사항
- 타이머는 프론트엔드에서만 관리, endAt 기준으로 시간 계산
- 서버는 결과 누적만 담당(`complete` 시 pomodoroDone/focusSeconds 증가)
- 설정은 타이머 시작 시 스냅샷 적용
- MVP는 인증 생략, userId 필드는 유지
- 단일 활성 타이머를 권장(멀티 탭 동시 실행은 막거나 경고)

## 11. 성공 기준 (Success Metrics)
- Todo CRUD + 타이머가 오류 없이 동작한다
- Flow 완료 시 Todo에 정확히 누적된다
- 설정 변경이 다음 타이머 실행부터 반영된다
- 구조 변경 없이 로그인 기능을 추가할 수 있다

## 12. 추가 기획
- 작은 습관의 힘 참고 (시스템 만들기)
  - 분명하게 만들어라 (언제, 어디서, 무엇을 할 것인가)
  - 매력적으로 만들어라 (좋은 점에 집중하라)
  - 하기 쉽게 만들어라 (ex. 가까운 헬스장, 간식 사지 않기)
  - 만족스럽게 만들어라 (ex. 스마트 워치)