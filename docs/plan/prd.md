# PRD – Todo + Pomodoro Web App (MVP)

## 1. 제품 개요

본 제품은 **Todo 관리 + 타이머**를 결합한 웹 애플리케이션이다.  
사용자는 Todo를 생성하고, 각 Todo에서 **Start 버튼을 눌러** 원하는 타이머(일반 타이머, 뽀모도로 타이머)를 시작할 수 있다.
또한 사용자는 작업 후 일일, 주간, 월간 회고를 통해 피드백 스스로 하여 생산성 개선을 돕는다.

본 MVP는 **로그인/멀티유저 없이 단일 로컬 사용자**를 가정하며,  
추후 인증 및 멀티유저 확장이 가능하고 커뮤니티 기능 확장이 가능하도록 구조를 설계한다.

레퍼런스:

- Todo UX: todomate
- Pomodoro UX: flow 앱

## 2. 목표 (Goals)

- Todo를 빠르고 직관적으로 관리할 수 있다
- Todo 단위로 타이머를 실행할 수 있다
    - 일반 타이머: 끊김 없는 몰입을 위한 카운트업 타이머에, 필요할 때만 추천/자유 휴식을 붙여 일반 타이머와 뽀모도로를 유연하게 오가는 방식.
    - 뽀모도로 타이머: 사용자가 설정한 Flow 시간 / 휴식 시간 / 주기(cycle)를 타이머에 반영한다
- Flow 1회 완료 시 Todo에 **집중 시간이 누적**된다
- 하루를 미니 데이 섹션(미분류/시간대 라벨)으로 나눠 계획/회고가 가능하다
- **일일/주간/월간 회고**로 집중 패턴을 돌아보고 회고할 수 있다.
- MVP 수준에서 **단순하지만 확장 가능한 구조**를 갖는다

## 3. 비목표 (Non-Goals)

다음 기능은 **이번 MVP 범위에서 제외**한다:

- 로그인 / 회원가입 / 멀티유저
- 서버 기반 실시간 타이머 동기화
- 소셜 기능
- 카테고리(태그) 및 루틴
- 집중 모드 배경음악(Lo-fi) 기능
- 오늘하기 및 날짜 바꾸기 기능
- 카테고리 자동 지정 ex) ps: 해시 개념 풀이 -> 카테고리 = ps, 해시 개념 풀이 = title
- 세션 편집 기능

## 4. 기술 스택

### Frontend

- Vite + pnpm, React 19 + TypeScript
- React Router (CSR)
- TanStack Query, Zustand (타이머 endAt/phase 저장)
- react-hook-form + zod
- Tailwind CSS, date-fns, clsx
- Vitest + @testing-library/react, ESLint
- Timer는 **클라이언트에서 실행**

### Backend

- Spring Boot
- Spring Web
- Spring Data JPA
- DB: MySQL(Prod, Dev), H2(Local)
- 마이그레이션: Flyway

> MVP는 게스트 모드이며, 클라이언트에서 생성한 `X-Client-Id`를 userId로 사용한다.

## 5. 핵심 사용자 플로우

1. 사용자는 Todo를 생성한다.
2. 사용자는 Todo에서 타이머를 시작한다.
3. 시스템은 사용자 설정을 불러오고, 타이머를 실행한다.
4. 사용자는 상황에 따라 **뽀모도로(카운트다운)** 또는 **일반(카운트업)** 방식으로 집중을 진행한다.
5. 집중이 진행되는 동안 사용자는 필요 시 **휴식** 또는 **완료**로 상태를 전환한다.
6. 시스템은 완료된 집중 단위를 기준으로 **완료 횟수(sessionCount)**와 **집중 시간(sessionFocusSeconds)**을 누적한다.
7. 타이머는 설정과 사용자 선택에 따라 **집중 ↔ 휴식** 흐름을 반복한다.
8. 이후 사용자는 일일/주간/월간 회고를 통해 어떤 작업들을 했는지, 얼마나 집중했는지를 확인한다.

## 6. 기능 요구사항

### 6.1 Todo

- Todo 생성 / 수정 / 삭제
- 메모 생성 / 수정 / 삭제
- Todo 완료 체크 (홈에서 완료하거나, 타이머 환경에서 완료)
- 캘린더 기반 날짜 선택/필터 (월/주 뷰)
- 미니 데이 섹션으로 분리된 목록
    - 미분류 + 시간대 라벨 기준 섹션 구성
    - 드래그로 섹션 내 정렬 및 섹션 간 이동
    - 완료 항목은 섹션 하단으로 정렬 (UI 분리 없이 동일 리스트)
    - 사용자가 설정한 시간대에 맞춰 해당 섹션이 펼침이 되고, 다른 섹션은 자유롭게 펼침 닫힘이 가능하고, 모두 펼침과 모두 접힘으로 빠르게 확인할 수 있다.

### 6.2 타이머

#### 일반 타이머 (Flexible/Flow)

- 카운트업 방식 (00:00부터 시작)
- **Flow 개념**: `MIN_FLOW_MS` 이상 집중 + 명시적 행동(휴식/완료)
    - 최소 집중 시간: `MIN_FLOW_MS` (현재 1분, 상수로 조정 가능)
    - 완료된 Flow만 카운트 (`sessionCount`)
    - 완료 시 현재 세션만 처리 (중복 카운트 방지)
- **휴식 기능**:
    - "휴식" 버튼 클릭 → 추천 휴식 / 자유 휴식 선택
    - 추천 휴식: 집중 시간(분) * 20%를 반올림한 분 단위 (0분 가능, 카운트다운)
    - 자유 휴식: 무제한 카운트업
- **세션**:
    - 각 세션의 집중 시간과 휴식 시간 저장 (초 단위)
    - 휴식 종료(집중 재개) 시 세션 확정
    - 집중 재개 시 마지막 세션의 휴식 시간 업데이트
    - 집중 재개 후 새로운 세션 시작 (0부터 카운트업)
    - Session은 **MVP에서 서버 저장** (localStorage는 복원/캐시 용도)
- Pause / Resume / Reset 지원 (Stop은 UI에 별도 버튼 없음)
- 자동화 설정 적용: 일반 타이머는 `autoStartSession`만 적용 (추천 휴식 종료 시 자동 집중 시작). `autoStartBreak`는 뽀모도로 전용

#### 뽀모도로 타이머

- Todo 단위로 실행된다
- 타이머는 다음 phase를 가진다:
    - Flow
    - Short Break
    - Long Break
- 기본 규칙:
    - Flow 인정 조건: 실제 경과가 `MIN_FLOW_MS`(현재 1분) 이상일 때만 sessionCount 증가
    - Flow 완료 횟수가 cycleEvery에 도달하면 Long Break
    - 그 외에는 Short Break
    - 긴 휴식 완료 후 자동으로 사이클 초기화 (`cycleCount = 0`)
    - Break 반영 조건: 실제 휴식 경과가 `MIN_FLOW_MS`(현재 1분) 이상일 때만 마지막 세션의 `breakSeconds` 반영
- 타이머는 **endAt 기준**으로 시간 계산을 한다
- Pause / Resume / Reset 지원 (Stop은 UI에 별도 버튼 없음)
- 자동화 설정:
    - `autoStartBreak`: Flow 완료 후 자동으로 Break 시작
    - `autoStartSession`: Break 완료 후 자동으로 Flow 시작

### 6.3 Settings (Pomodoro 설정)

사용자는 다음 값을 설정할 수 있다:

- 뽀모도로 타이머 설정
    - flowMin (집중 시간, 분, 기본 값: 25)
    - breakMin (짧은 휴식 시간, 분, 기본 값: 5)
    - longBreakMin (긴 휴식 시간, 분, 기본 값: 15)
    - cycleEvery (몇 번의 Flow마다 긴 휴식, 기본 값: 4)
- 자동화 설정
    - autoStartBreak (Flow 완료 후 자동으로 Break 시작, 기본 값: false)
    - autoStartSession (Break 완료 후 자동으로 Flow 시작, 기본 값: false)
- 미니 데이 설정
    - 하루를 세 개로 구분하여 사용자는 label과 그 시간대를 자유롭게 설정할 수 있다.
    - 기본 값
        - label 1: 오전, 시간대: 6-12
        - label 2: 오후, 시간대: 12-18
        - label 3: 저녁, 시간대: 18:24

### 6.4 회고 (통계 + 회고)

- `/review`에서 **일일/주간/월간 회고** 확인
- 회고 페이지는 통계 요약 + 타임라인(완료/미완료) + 회고 입력을 포함
- MVP에선 일일/주간/월간을 지원

## 7. 데이터 모델

- 단일 소스: `docs/plan/data.md`
- 본 문서에서는 상세 스키마를 반복하지 않음

## 8. API 요구사항

- 단일 소스: `docs/plan/api.md`

## 9. UI 구성

### Pages

- /todos
    - Todo 리스트
    - 각 Todo에 Start 버튼
- /review
    - 회고(통계 + 회고) 화면
- /settings
    - Pomodoro 설정 화면

## 10. 기술적 결정 사항

- 타이머는 프론트엔드에서만 관리, endAt 기준으로 시간 계산
- 서버는 결과 누적만 담당 (Session 생성 시 sessionCount/sessionFocusSeconds 증가)
- 클라이언트는 `sessions`를 **초 단위**로 localStorage에 저장 (타이머 복원/통계용)
- 타이머 진행 상태(`remainingMs`, `elapsedMs`, `focusElapsedMs`, `breakElapsedMs`)는 **ms 단위**로 관리한다.
- 설정은 타이머 시작 시 스냅샷 적용
- MVP는 게스트 모드이며 `X-Client-Id`를 userId로 사용
- 단일 활성 타이머를 권장(멀티 탭 동시 실행은 막거나 경고)

## 11. 기획 영감

- 작은 습관의 힘 참고 (시스템 만들기)
    - 분명하게 만들어라 (언제, 어디서, 무엇을 할 것인가)
    - 매력적으로 만들어라 (좋은 점에 집중하라)
    - 하기 쉽게 만들어라 (ex. 가까운 헬스장, 간식 사지 않기)
    - 만족스럽게 만들어라 (ex. 스마트 워치)
- 루프: 목표 설정 -> 실행 -> 리뷰 -> 재실행 
