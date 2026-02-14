# FlowMate

Todo(할 일)와 타이머(집중 세션 기록)를 하나로 묶어, 오늘 무엇을 얼마나 했는지 기록이 남는 생산성 웹 앱입니다.

## Why FlowMate?

개인적으로 Todo 태스크 관리는 `TodoMate`, 집중 시간 관리(뽀모도로)는 `Flow`를 함께 사용해왔습니다.  
하지만 두 앱을 번갈아 쓰다 보니 컨텍스트가 자주 끊기고, “할 일”과 “집중 기록”이 분리되어 관리되는 점이 불편했습니다.

- `TodoMate`는 태스크 관리가 직관적이고 심플해서 애용했지만, 카운트업(Stopwatch) 타이머만 제공해 뽀모도로 타이머가 필요했습니다.
- `Flow`도 뽀모도로 기반으로 직관적이고 심플하며 순수 집중 시간 측정 혹은 세션 기록에는 좋았지만, 태스크 기반이 아니라 “무엇을 하며 집중했는지”가 함께 남지 않아 아쉬웠습니다.

FlowMate는 이 경험을 바탕으로 Todo를 중심으로 태스크와 집중 세션을 한 흐름에서 기록하고,  
그 결과를 캘린더와 회고로 되돌아볼 수 있는 애플리케이션을 목표로 기획했습니다.

또한 FlowMate의 핵심은 ‘유연한 일반 타이머(카운트업)’입니다. 기존 뽀모도로의 카운트다운/알림이 오히려 몰입을 끊는 경험이 있었기 때문에, 사용자가 한 태스크를 끝까지 집중하다가 필요할 때만
추천 휴식(가이드) 또는 자유 휴식(선택)을 추가하는 방식으로 설계했습니다. 이를 통해 일반 타이머처럼 자연스럽게 사용하면서도 상황에 따라 뽀모도로처럼 유연하게 활용할 수 있습니다.

## 주요 기능 (v1)

### 핵심 요약

- Todo 관리: 날짜별 할 일 생성/수정/삭제
    - 메모: 할 일별 메모 추가
    - 하루를 미니 데이 섹션(미분류/오전/오후/저녁)으로 분리, 사용자가 설정을 통해 라벨 및 시간대 변경 가능
- 캘린더 뷰
    - 작업 뷰: 주간/월간 뷰 지원, 태스크를 기준으로 진행 상황 표시
    - 회고 뷰: 일간/주간/월간 타임라인(완료/미완료) 제공
- 이중 타이머 시스템
    - 일반 타이머(Stopwatch, 카운트업)
        - 한 태스크에 끊김 없이 몰입할 수 있도록 설계된 타이머
        - 필요할 때만 추천 휴식(가이드) 또는 자유 휴식(사용자 선택)을 추가해,
          일반 카운트업 타이머처럼 쓰면서도 유연하게 뽀모도로 방식으로도 활용 가능
        - 기존 뽀모도로의 카운트다운/알림이 집중을 깨는 경험을 줄이기 위한 방향
    - 뽀모도로(Pomodoro)
        - 기본 25분 집중 + 5분 휴식 사이클 제공
        - 사용자 설정으로 집중/휴식 시간을 자유롭게 변경 가능
- 회고: 통계를 기반으로 일일/주간/월간 회고 가능 (MVP 범위)
- 설정: 타이머 시간, 자동 시작 등 커스터마이징

> 상세 요구사항/전략은 `docs/plan/prd.md`에서 관리합니다.

## 기술 스택

### Frontend (추후 왜 선택했는지 자세히)

- Framework: React 19 + TypeScript
- Build: Vite
- Routing: React Router
- State Management
    - TanStack Query (서버 상태)
    - Zustand (클라이언트 상태 - 타이머)
- Styling: Tailwind CSS 4.x
- Form: react-hook-form + Zod
- DnD: @dnd-kit
- Testing: Vitest + @testing-library/react
- Mocking: MSW (Mock Service Worker)

### Backend (추후 왜 선택했는지 자세히)

- Framework: Spring Boot 4.0.x
- Database: MySQL (Local, Dev, Prod)
- Migration: Flyway

## 프로젝트 구조 (모노레포)

```txt
FlowMate/
├── frontend/                 # React 앱
│   ├── src/
│   │   ├── api/              # API 클라이언트
│   │   ├── app/              # 앱 설정 (라우터, 프로바이더)
│   │   ├── features/         # 기능(도메인) 단위 모듈
│   │   │   ├── todos/            # Todo 관리
│   │   │   ├── timer/            # 타이머 (Zustand store)
│   │   │   ├── review/           # 회고 (일/주/월)
│   │   │   └── settings/         # 설정
│   │   ├── ui/               # 공통 UI 컴포넌트
│   │   ├── lib/              # 공용 유틸/헬퍼
│   │   └── mocks/            # MSW 핸들러
│   └── ...
├── backend/                  # Spring Boot 앱
├── infra/                    # 인프라/배포 구성
├── docs/                     # 문서
│   ├── apps/                 # 앱별 문서
│   │   ├── frontend.md    # 프론트엔드 가이드
│   │   ├── backend.md     # 백엔드 가이드
│   │   └── infra.md       # 인프라/배포 초안
│   ├── plan/                 # 기획 문서 (PRD/API/Data Model)
│   ├── README.md             # 문서 인덱스
└── AGENTS.md                 # 기여자 가이드
```

## 시작하기

### 개발 환경 요구사항

- Node.js 22.12.0 (`.nvmrc` 기준)
- pnpm 8+
- Java 21
- MySQL 8.x (local profile 기준)

### Frontend 실행

```bash
cd frontend

# 의존성 설치
pnpm install

# 개발 서버 실행 (MSW 모킹)
pnpm dev:mock

# 브라우저에서 http://localhost:5173 접속
```

### Backend 실행

```bash
cd backend

# 테스트
./gradlew test

# 로컬 실행 (MySQL + Flyway)
./gradlew bootRun --args='--spring.profiles.active=local'
```

- `local` 프로필은 MySQL을 사용합니다.
- DB 계정 환경변수는 `DB_USERNAME`, `DB_PASSWORD`를 사용하며, 미지정 시 기본값은 `flowmate/flowmate`입니다.

### 유용한 스크립트

```bash
# 일반 개발 서버 (API 연동 환경에서 사용)
pnpm dev

# MSW 모킹 개발 서버
pnpm dev:mock

# 포트 지정 실행
pnpm dev:port 1019
pnpm dev:mock:port 1019

# 단위 테스트
pnpm test

# 빌드/프리뷰
pnpm build
pnpm preview
```

## 테스트

```bash
cd frontend

# 단위 테스트 실행
pnpm test

cd ../backend

# 백엔드 테스트 실행
./gradlew test
```
