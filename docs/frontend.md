# Frontend Implementation Plan (React + Vite)

## 1. 스택/의존성
- Vite + pnpm
- React 18 + TypeScript
- React Router
- TanStack Query
- Zustand (타이머 상태)
- Tailwind CSS
- react-hook-form + zod
- date-fns, clsx
- Vitest + @testing-library/react

---

## 2. 폴더 구조(추천)
```
src/
  app/
    main.tsx
    App.tsx
    routes.tsx
    queryClient.ts
  api/
    http.ts
    todos.ts
    settings.ts
    types.ts
  features/
    todos/
      TodosPage.tsx
      components/
        TodoList.tsx
        TodoRow.tsx
        TodoEditor.tsx
      hooks/
        useTodos.ts
    timer/
      TimerPage.tsx
      timerStore.ts
      components/
        TimerDisplay.tsx
        TimerControls.tsx
        PhaseBadge.tsx
    settings/
      PomodoroSettingsPage.tsx
      hooks/
        usePomodoroSettings.ts
  ui/
    Button.tsx
    Input.tsx
    Dialog.tsx
    Toast.tsx
  styles/
    globals.css
```

---

## 3. 라우팅
- `/todos` : Todo 리스트/추가/완료/삭제/편집/Start 이동
- `/timer/:todoId` : 타이머 화면
- `/settings/pomodoro` : 설정 화면

---

## 4. 상태 관리
- 서버 상태: TanStack Query
  - `useTodos`, `useCreateTodo`, `useUpdateTodo`, `useDeleteTodo`
  - `usePomodoroSettings`, `useUpdatePomodoroSettings`
- 클라이언트/타이머: Zustand
  - 필드: `phase`, `status`, `endAt`, `cycleCount`, `todoId`, `settingsSnapshot`
  - actions: `start`, `pause`, `resume`, `stop`, `tick`, `completePhase`, `restore`
  - sessionStorage에 스냅샷 저장/복구

---

## 5. 타이머 로직
- 남은 시간: `endAt - Date.now()` 계산, interval은 UI 업데이트용(1s)
- Flow 완료: `POST /api/todos/{id}/pomodoro/complete`, `cycleCount += 1`
- 다음 phase: `cycleEvery`마다 Long Break, 그 외 Short Break
- Break 종료 → Flow 전환
- Stop: 누적 없이 종료, 스토리지 초기화
- 멀티 탭: 단일 활성 권장(다른 탭 실행 시 경고/차단)
- `visibilitychange` 시 남은 시간 재계산

---

## 6. API 연동/모킹
- 엔드포인트: `/api/todos`, `/api/settings/pomodoro`, `/api/todos/{id}/pomodoro/complete`
- `http.ts`: baseURL 래퍼 + 에러 매핑 + zod 응답 파싱
- 개발 시 MSW로 모킹 가능(`USE_MOCK` 플래그)

---

## 7. Validation
- Todo title: 1~200자
- Settings: flowMin 1~180, breakMin 1~60, longBreakMin 1~120, cycleEvery 1~12
- durationSec(complete): 권장 1~10800

---

## 8. UX 기본
- 네트워크 실패 시 toast + 재시도 버튼(필요 시)
- 요청 중 버튼 disabled
- 삭제 Undo(5초) 권장
- 타이머 새로고침 복구(sessionStorage)

---

## 9. 테스트
- 타이머 phase 전환/remaining 계산 unit test
- timer store pause/resume/restore 테스트
- Todo CRUD + settings fetch/update MSW 통합 테스트(정상/실패 간단 케이스)

---

## 10. 환경 변수
- `VITE_API_BASE_URL`
- `USE_MOCK`
