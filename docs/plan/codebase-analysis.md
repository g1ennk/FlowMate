# Codebase Analysis (Frontend 중심)

## 1. 구조 요약
- `frontend/src/features`에 도메인별 기능 분리
  - `todos`: CRUD, 메모, 캘린더, 통계
  - `timer`: 타이머 스토어/화면/헬퍼
  - `settings`: 뽀모도로 설정
- API 계층: `frontend/src/api` (Zod 검증 포함)
- 상태 관리: TanStack Query + Zustand
- 모킹: MSW

## 2. 핵심 흐름
### Todo 흐름
- `TodosPage` → `useTodoActions` → `todoApi` (MSW/실 API)
- timer 관련 동작은 `TimerFullScreen`에서 스토어 액션 호출

### Timer 흐름
- `timerStore`가 상태/전이를 관리
- `useTimerTicker`가 100ms마다 `tick()` 호출
- 완료 처리 로직은 `completeHelpers`에서 API 호출 + sessionHistory 업데이트

### 통계 흐름
- `StatsPage` → `buildStats` (sessionHistory 우선, 없으면 focusSeconds)

## 3. 복잡도/리스크 포인트
- `timerStore.ts`, `TimerFullScreen.tsx` 파일이 크고 의존성이 많음
- 로컬 `sessionHistory`와 서버 `focusSeconds`의 불일치 가능
- 통계 계산 기준 혼재 가능
- 100ms tick으로 인한 성능 리스크

## 4. 리팩토링 방향
- 타이머 로직 분리
  - `timerTypes`, `timerDefaults`, `timerPersistence`로 분리
  - 순수 계산/전이 로직 추가 분리 여지
- 통계 계산 분리
  - `statsUtils`로 계산/포맷 분리
- 로컬 저장소 접근 추상화
  - persistence 모듈로 캡슐화

## 5. 추후 개선 제안
- 순수 도메인 로직을 `timerDomain` 모듈로 분리
- UI/상태 로직 분리 (TimerFullScreen 슬림화)
- 통계 계산 테스트 추가
- sessionHistory 서버 이관 설계 반영
