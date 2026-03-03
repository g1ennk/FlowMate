# PRD – Todo + Pomodoro Web App (MVP)

> 역할: 초기 MVP 기획 문서. 현재 API/데이터 계약 정본은 `docs/plan/api.md`, `docs/plan/data.md`다.
> 상태: historical

## 현재 구현과 차이

이 문서는 초기 MVP 기획을 보존하기 위한 문서이며, 아래 항목은 현재 구현과 다르다.

- 초기 PRD의 전제였던 `X-Client-Id` 기반 게스트 식별은 현재 사용하지 않는다.
- 현재 인증은 guest JWT + 카카오 OAuth 회원 로그인으로 전환됐다.
- 초기 비목표에 있던 로그인/소셜 기능은 현재 MVP 범위에 일부 포함됐다.
- 초기 PRD의 비목표였던 서버 기반 실시간 타이머 동기화는 현재 member 대상 `SSE + REST + DB-only` 구조로 구현됐다.
- 현재 member 타이머 스트림은 `connected`/`heartbeat`/`timer-state` 이벤트를 사용하며, 상세 계약은 `docs/plan/api.md`를 따른다.
- 게스트에서 회원으로 로그인할 때 데이터 병합 없이 새 출발 정책을 사용한다.

## 1. 제품 개요

본 제품은 **Todo 관리 + 타이머**를 결합한 웹 애플리케이션이다.  
사용자는 Todo를 생성하고, 각 Todo에서 **Start 버튼을 눌러** 원하는 타이머(일반 타이머, 뽀모도로 타이머)를 시작할 수 있다.
또한 사용자는 작업 후 일일, 주간, 월간 회고를 통해 피드백 스스로 하여 생산성 개선을 돕는다.

본 문서의 본문은 **초기 MVP 가정**을 바탕으로 작성되었다.  
현재 구현은 이 문서의 구조를 기반으로 확장되었지만, 인증/배포/운영 상태는 별도 정본 문서를 따른다.

레퍼런스:

- Todo UX: todomate
- Pomodoro UX: flow 앱

## 2. 목표 (Goals)

- Todo를 빠르고 직관적으로 관리할 수 있다
- Todo 단위로 타이머를 실행할 수 있다
  - 일반 타이머: 끊김 없는 몰입을 위한 카운트업 타이머에, 필요할 때만 추천/자유 휴식을 붙여 일반 타이머와 뽀모도로를 유연하게 오가는 방식
  - 뽀모도로 타이머: 사용자가 설정한 Flow 시간 / 휴식 시간 / 주기(cycle)를 타이머에 반영한다
- Flow 1회 완료 시 Todo에 **집중 시간이 누적**된다
- 하루를 미니 데이 섹션(미분류/시간대 라벨)으로 나눠 계획/회고가 가능하다
- **일일/주간/월간 회고**로 집중 패턴을 돌아보고 회고할 수 있다
- MVP 수준에서 **단순하지만 확장 가능한 구조**를 갖는다

## 3. 초기 비목표 (Historical Non-Goals)

다음 항목은 **초기 PRD 작성 시점의 비목표**였다.

- 로그인 / 회원가입 / 멀티유저
- 서버 기반 실시간 타이머 동기화
- 소셜 기능
- 카테고리(태그) 및 루틴
- 집중 모드 배경음악 기능
- 세션 편집 기능

## 4. 기술 스택

### Frontend

- Vite + pnpm, React 19 + TypeScript
- React Router (CSR)
- TanStack Query, Zustand
- react-hook-form + zod
- Tailwind CSS, date-fns, clsx
- Vitest + Testing Library, ESLint
- Timer는 클라이언트에서 실행

### Backend

- Spring Boot
- Spring Web
- Spring Data JPA
- MySQL
- Flyway

## 5. 핵심 사용자 플로우

1. 사용자는 Todo를 생성한다.
2. 사용자는 Todo에서 타이머를 시작한다.
3. 시스템은 사용자 설정을 불러오고, 타이머를 실행한다.
4. 사용자는 뽀모도로 또는 일반 타이머 방식으로 집중을 진행한다.
5. 필요 시 휴식 또는 완료로 상태를 전환한다.
6. 시스템은 완료된 집중 단위를 기준으로 `sessionCount`, `sessionFocusSeconds`를 누적한다.
7. 사용자는 일일/주간/월간 회고를 통해 어떤 작업을 했는지, 얼마나 집중했는지 확인한다.

## 6. 기능 요구사항

### 6.1 Todo

- Todo 생성 / 수정 / 삭제
- 메모 생성 / 수정 / 삭제
- Todo 완료 체크
- 캘린더 기반 날짜 선택/필터
- 미니 데이 섹션 목록
  - 미분류 + 시간대 라벨 기준 섹션 구성
  - 드래그로 섹션 내 정렬 및 섹션 간 이동
  - 완료 항목은 섹션 하단으로 정렬

### 6.2 타이머

#### 일반 타이머 (Flexible/Flow)

- 카운트업 방식
- `MIN_FLOW_MS` 이상 집중 + 명시적 행동(휴식/완료)일 때만 Flow 인정
- 추천 휴식 / 자유 휴식 제공
- 세션은 초 단위로 서버 저장
- Pause / Resume / Reset 지원

#### 뽀모도로 타이머

- Todo 단위 실행
- Flow / Short Break / Long Break phase
- `cycleEvery` 도달 시 Long Break
- `endAt` 기준 시간 계산
- Pause / Resume / Reset 지원

### 6.3 Settings

- 뽀모도로 타이머 설정
- 자동화 설정
- 미니 데이 설정

### 6.4 회고

- `/review`에서 일일/주간/월간 회고 확인
- 통계 요약 + 타임라인 + 회고 입력 포함

## 7. 데이터 모델

- 현재 정본: `docs/plan/data.md`

## 8. API 요구사항

- 현재 정본: `docs/plan/api.md`

## 9. UI 구성

- `/todos`
- `/review`
- `/settings`

## 10. 기술적 결정 사항

초기 PRD 기준 핵심 결정:

- 타이머는 프론트엔드에서 관리하고 서버는 결과 누적만 담당
- 설정은 타이머 시작 시 스냅샷 적용
- 단일 활성 타이머를 권장

현재 구현에서는 여기에 더해 guest/member JWT 인증, refresh cookie, 카카오 OAuth, member 서버 정본 타이머 + SSE keepalive가 포함된다.

## 11. 기획 영감

- 작은 습관의 힘 참고
- 루프: 목표 설정 -> 실행 -> 리뷰 -> 재실행
