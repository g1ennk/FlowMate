# Todo Flow - Frontend

캘린더 기반 Todo + 뽀모도로 타이머 웹앱

## 📦 기술 스택

- **Framework**: React 18 + TypeScript + Vite
- **State**: TanStack Query (서버) + Zustand (클라이언트)
- **Styling**: Tailwind CSS 4.x
- **Form**: react-hook-form + Zod
- **DnD**: @dnd-kit
- **Mock**: MSW (Mock Service Worker)
- **Test**: Vitest

## 🚀 실행 방법

```bash
# 의존성 설치
pnpm install

# 개발 서버 (MSW 모킹, localhost:5175)
pnpm dev:mock

# 개발 서버 (실제 API 연동)
pnpm dev

# 프로덕션 빌드
pnpm build

# 빌드 미리보기
pnpm preview

# 테스트
pnpm test
```

## 📁 폴더 구조

```
src/
├── api/          # API 클라이언트 & 타입
├── app/          # 앱 설정, 라우팅
├── features/     # 기능별 컴포넌트
│   ├── todos/    # Todo 관리
│   ├── timer/    # 타이머
│   └── settings/ # 설정
├── ui/           # 공통 UI 컴포넌트
├── lib/          # 유틸리티
├── mocks/        # MSW 핸들러
└── styles/       # 글로벌 스타일
```

## ✨ 주요 기능

### 📅 캘린더
- 월간/주간 뷰 전환
- 스와이프로 월/주 이동
- 날짜별 Todo 관리
- 진행도 표시

### ✅ Todo
- 생성/수정/삭제/완료
- 드래그로 순서 변경
- 메모 기능
- 일별 통계 뱃지

### ⏱️ 타이머
- **뽀모도로**: Flow → 휴식 자동 전환
- **일반 타이머**: 스톱워치
- 완료 시 알림음
- 세션 기록

## 🔧 환경 변수

```env
VITE_API_BASE_URL=/api    # API 베이스 URL
VITE_USE_MOCK=1           # MSW 모킹 활성화
```

## 📊 데이터 저장

개발 환경에서는 **localStorage**에 데이터가 저장됩니다.
- `todo-flow/todos` - Todo 목록
- `todo-flow/settings` - 뽀모도로 설정

초기화하려면 브라우저 DevTools → Application → Local Storage에서 삭제하세요.

## 🧪 테스트

```bash
pnpm test        # 전체 테스트 실행
pnpm test:ui     # UI 모드로 실행
```

| 테스트 파일          | 내용             |
| -------------------- | ---------------- |
| `timerStore.test.ts` | 타이머 상태 관리 |
| `api.test.ts`        | API 통합 테스트  |
