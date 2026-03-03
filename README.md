# FlowMate

> 상태: current
> 역할: 프로젝트 개요와 실행 진입점 안내. API/데이터 계약 정본은 `docs/plan/api.md`, `docs/plan/data.md`다.

Todo(할 일)와 타이머(집중 세션 기록)를 하나로 묶어, 오늘 무엇을 얼마나 했는지 남기는 생산성 웹 앱이다.

## Why FlowMate?

개인적으로 Todo 관리는 `TodoMate`, 집중 시간 관리는 `Flow`를 함께 사용해왔다.  
하지만 두 앱을 번갈아 쓰다 보니 컨텍스트가 자주 끊기고, “할 일”과 “집중 기록”이 분리되는 점이 불편했다.

- `TodoMate`는 태스크 관리가 직관적이지만 뽀모도로 타이머가 없다.
- `Flow`는 집중 시간 측정에는 좋지만 태스크 기반 기록이 약하다.

FlowMate는 Todo를 중심으로 태스크와 집중 세션을 한 흐름에서 기록하고, 그 결과를 캘린더와 회고로 되돌아볼 수 있게 설계했다.

## 현재 상태

- MVP 핵심 기능 구현 완료
- 게스트 JWT + 카카오 OAuth 회원 로그인 구현 완료
- 회원 타이머 상태 서버 저장 + SSE 기반 동기화 구현 완료
- Frontend: S3 + CloudFront, Backend API: EC2 + Docker Compose + Host Nginx 운영 구조 정리 완료
- 현재 작업 초점: 문서/운영 정합화, 테스트 보강, 성능 측정

## 주요 기능

- Todo 관리
  - 날짜별 생성/수정/삭제
  - 메모 작성
  - 미니 데이 섹션(미분류/오전/오후/저녁) 정렬
- 타이머
  - 일반 타이머(카운트업 + 추천/자유 휴식)
  - 뽀모도로 타이머(집중/휴식/긴 휴식 사이클)
  - 회원 기준 서버 복원 + SSE(`connected`/`heartbeat`/`timer-state`) 기반 크로스 디바이스 동기화
  - 완료 세션 서버 저장 및 Todo 집계 반영
- 회고
  - 일간/주간/월간 통계
  - 회고 작성/수정/삭제
- 설정
  - 뽀모도로 시간
  - 자동 시작 옵션
  - 미니 데이 라벨/시간대

## 인증 모델

- 게스트: `POST /api/auth/guest/token`으로 발급한 guest JWT를 `Authorization: Bearer`로 사용
- 회원: 카카오 로그인 후 access JWT를 `Authorization: Bearer`로 사용
- 세션 복원: `refreshToken`은 HttpOnly 쿠키로 보관하고 `/api/auth/refresh`로 access JWT를 재발급
- `/api/auth/me`는 회원 전용

## 기술 스택

### Frontend

- React 19 + TypeScript
- Vite
- React Router
- TanStack Query
- Zustand
- Tailwind CSS 4
- Vitest + Testing Library
- MSW

### Backend

- Spring Boot 4.0.2
- Java 21
- Spring Data JPA
- Spring Security
- Flyway
- MySQL 8

### Deployment

- Frontend: S3 + CloudFront
- Backend API: EC2 + Docker Compose + Host Nginx + Certbot
- Domains
  - Frontend Dev: `https://dev.flowmate.io.kr`
  - Frontend Prod: `https://flowmate.io.kr`
  - API Dev: `https://api.dev.flowmate.io.kr`
  - API Prod: `https://api.flowmate.io.kr`

## 프로젝트 구조

```txt
FlowMate/
├── frontend/                 # React 앱
├── backend/                  # Spring Boot API
├── infra/                    # Dev/Prod 인프라 구성
├── docs/
│   ├── plan/                 # 현재 계약 문서
│   ├── agent/                # 작업 계획/참고 문서
│   └── engineering-log/      # 결정/운영/학습 로그
└── AGENTS.md                 # 기여 가이드
```

## 시작하기

### 요구사항

- Node.js 22.12.0
- pnpm 8+
- Java 21
- MySQL 8.x

### Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

MSW 모킹 서버:

```bash
cd frontend
pnpm dev:mock
```

### Backend

```bash
cd backend
./gradlew test
./gradlew bootRun --args='--spring.profiles.active=local'
```

로컬 실행 전 상세 env는 [`backend/README.md`](backend/README.md)를 따른다.  
특히 `JWT_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`가 필요하다.

## 정본 문서

- [`docs/plan/api.md`](docs/plan/api.md): API 계약 정본
- [`docs/plan/data.md`](docs/plan/data.md): 데이터 모델/스키마 정본
- [`frontend/README.md`](frontend/README.md): 프론트엔드 실행/구조
- [`backend/README.md`](backend/README.md): 백엔드 실행/구조
- [`infra/README.md`](infra/README.md): 배포/운영 구조

## 테스트

```bash
cd frontend
pnpm test
pnpm lint
pnpm build

cd ../backend
./gradlew test
```
