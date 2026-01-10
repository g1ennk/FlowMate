# Todo-Flow

> 할 일 관리와 뽀모도로 타이머를 결합한 생산성 앱

## 🎯 프로젝트 소개

Todo-Flow는 할 일 관리(Todo)와 집중 시간 추적(Pomodoro Timer)을 하나로 통합한 웹 애플리케이션입니다.

### 주요 기능
- ✅ **Todo 관리**: 날짜별 할 일 생성, 수정, 삭제
- 📅 **캘린더 뷰**: 월간/주간 뷰 지원, 일별 진행 상황 표시
- ⏱️ **이중 타이머 시스템**:
  - 일반 타이머 (Stopwatch): 자유로운 시간 측정
  - 뽀모도로 타이머: 25분 집중 + 5분 휴식 사이클
- 📊 **통계**: 일별 완료/미완료/세션 통계
- 🎯 **드래그 앤 드롭**: 할 일 순서 변경
- 📝 **메모**: 각 할 일에 메모 추가
- ⚙️ **설정**: 타이머 시간, 자동 시작 등 커스터마이징

## 🛠️ 기술 스택

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Routing**: React Router
- **State Management**: 
  - TanStack Query (서버 상태)
  - Zustand (클라이언트 상태 - 타이머)
- **Styling**: Tailwind CSS 4.x
- **Form**: react-hook-form + Zod
- **DnD**: @dnd-kit
- **Testing**: Vitest + @testing-library/react
- **Mocking**: MSW (Mock Service Worker)

### Backend (예정)
- **Framework**: Spring Boot 3.x
- **Database**: MySQL (Prod) / H2 (Dev)
- **Migration**: Flyway

## 📁 프로젝트 구조

```
todo-flow/
├── frontend/           # React 앱
│   ├── src/
│   │   ├── api/       # API 클라이언트
│   │   ├── app/       # 앱 설정 (라우터, 프로바이더)
│   │   ├── features/  # 기능별 모듈
│   │   │   ├── todos/     # Todo 관리
│   │   │   ├── timer/     # 타이머 (Zustand store)
│   │   │   └── settings/  # 설정
│   │   ├── ui/        # 공통 UI 컴포넌트
│   │   ├── lib/       # 유틸리티
│   │   └── mocks/     # MSW 핸들러
│   └── ...
├── backend/            # Spring Boot 앱 (예정)
├── docs/              # 문서
│   ├── plan/         # 기획 문서
│   │   ├── prd.md    # 제품 요구사항 정의서
│   │   ├── design.md # UI/UX 설계
│   │   └── api.md    # API 명세
│   ├── frontend.md   # 프론트엔드 가이드
│   ├── backend.md    # 백엔드 가이드
│   └── test/         # 테스트 문서
│       └── TIMER_TEST.md  # 타이머 테스트 가이드 (35개 케이스)
└── AGENT.md          # 개발 가이드

```

## 🚀 시작하기

### 개발 환경 요구사항
- Node.js 18+
- pnpm 8+

### Frontend 실행

```bash
cd frontend

# 의존성 설치
pnpm install

# 개발 서버 실행 (MSW 모킹)
pnpm dev:mock

# 브라우저에서 http://localhost:5173 접속
```

## 📚 문서

- **[AGENT.md](./AGENT.md)**: 전체 로드맵 및 개발 가이드
- **[Frontend 가이드](./docs/frontend.md)**: 프론트엔드 구현 상세
- **[Backend 가이드](./docs/backend.md)**: 백엔드 구현 계획
- **[PRD](./docs/plan/prd.md)**: 제품 요구사항
- **[API 명세](./docs/plan/api.md)**: API 상세 스펙
- **[타이머 테스트](./docs/test/TIMER_TEST.md)**: 35개 테스트 케이스

## 🧪 테스트

```bash
cd frontend

# 단위 테스트 실행
pnpm test

# 타이머 수동 테스트 (docs/test/TIMER_TEST.md 참고)
pnpm dev:mock
```

## 📈 현재 상태

✅ **Frontend MVP 완료**
- Todo CRUD
- 캘린더 UI (월간/주간)
- 이중 타이머 시스템 (일반/뽀모도로)
- 통계 및 뱃지
- MSW 기반 개발 환경
- 35개 테스트 케이스 검증 완료

🚧 **다음 단계**
- Backend API 구현 (Spring Boot)
- MySQL 연동
- 배포 환경 구성

## 🤝 기여

개인 프로젝트이지만 피드백 환영합니다!

## 📝 라이선스

Private Project

---

> **Last Updated**: 2026-01-10  
> **Status**: Frontend MVP 완료, Backend 작업 준비 중
