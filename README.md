# FlowMate

Todo를 적는 순간부터 집중 세션을 실행하고, 타이머 기록을 회고까지 이어가는 생산성 웹 앱입니다.

할 일 관리와 집중 기록이 서로 분리될 때 생기는 전환을 줄이고, 하루와 주간 단위의 작업 흐름 그리고 회고까지 하나의 서비스 안에서 이어가는 데 초점을 맞췄습니다.

- [Live Demo](https://flowmate.io.kr): 실제 서비스 바로가기
- [Architecture](docs/architecture.md): 시스템 구조, 인증 흐름, SSE 동기화, 배포 구조
- [Data Model](docs/data-model.md): 핵심 엔터티, 관계, 물리 모델, 설계 근거
- [API Docs](docs/api.md): 인증, Todo, 타이머, 설정, 회고 API 계약

## 1. 프로젝트 배경

개인적으로 Todo 관리는 `TodoMate`, 집중 시간 관리는 `Flow`를 함께 사용해왔습니다.

하지만 두 앱을 번갈아 쓰다 보니 컨텍스트가 자주 끊기고, “할 일”과 “집중 기록”이 분리되는 점이 불편했습니다.

- `TodoMate`는 태스크 관리가 직관적이지만 뽀모도로 타이머가 없다.
- `Flow`는 집중 시간 측정에는 좋지만 태스크 기반 기록이 약하다.

FlowMate는 Todo를 중심으로 태스크와 집중 세션을 한 흐름에서 기록하고, 그 결과를 캘린더와 회고로 되돌아볼 수 있게 설계하였습니다.

## 2. 주요 기능

### 1) Todo와 집중 세션 연결

- 할 일을 작성한 뒤 바로 타이머를 시작할 수 있습니다.
- 완료한 세션 기록은 Todo와 연결되어 이후 회고와 통계로 이어집니다.

### 2) 뽀모도로와 스톱워치 지원

- 뽀모도로 모드로 집중, 짧은 휴식, 긴 휴식 사이클을 관리할 수 있습니다.
- 스톱워치 모드로 더 집중 기록도 남기고, 추천 휴식과 자유 휴식을 제공하여 유연하게 사용할 수 있습니다.

### 3) 여러 탭·기기 간 타이머 동기화

- 회원은 서버에 저장된 타이머 상태를 기준으로 여러 탭과 기기에서 이어서 사용할 수 있습니다.
- SSE 기반 동기화로 같은 계정의 연결에 최신 타이머 상태를 전파합니다.

### 4) 회고와 AI KPT 레포트

- 집중 시간 타임라인과 누적 통계를 확인할 수 있습니다.
- 일간·주간·월간 단위 회고를 작성하며 작업 흐름을 돌아볼 수 있습니다.
- Gemini 기반 AI Service가 완료 Todo와 집중 기록을 바탕으로 KPT 회고 레포트를 생성합니다.

## 3. 주요 기술 결정

### 1) Timer State 저장 경로의 InnoDB Deadlock 분석과 해결

- 문제: k6 baseline에서 `PUT /api/timer/state/{todoId}` 실패 69건이 timer state 저장 경로에 집중
- 원인: row가 없는 first insert 경로에서 `SELECT FOR UPDATE`가 gap lock을 만들고, 동시 INSERT의 insert intention lock과 충돌
- 해결: `PESSIMISTIC_WRITE`를 제거하고, first insert 유일성 제약 조건 충돌은 winner row 재조회 후 update하는 catch-retry로 복구
- 결과: 수정 후 전체 요청 163,205건 기준 timer PUT 실패 0건, `http_req_failed` 0.00%를 확인
- 관련 문서: [Timer State 저장 경로의 InnoDB Deadlock 분석과 해결](docs/wiki/timer-deadlock.md)

### 2) 멀티디바이스 타이머 동기화: SSE + 단조 증가 Version

- 문제: 기기를 바꾸거나 새 탭을 열면 진행 중인 타이머가 사라짐 — 같은 계정이어도 기기·탭 간 상태 공유가 없었음
- 선택 기준: WebSocket은 과잉, Polling은 실시간성 부족 — 단방향 push 요구에 SSE + REST 채택
- 결과: 단조 증가 `version`과 snapshot fetch로 모든 기기에 즉시 반영되며, 재접속 후에도 최신 상태 유지 — k6 163,205 req · 에러율 0%
- 관련 문서: [멀티디바이스 타이머 동기화: SSE + 단조 증가 `version`](docs/wiki/sse-sync.md)

### 3) X-Client-Id에서 OAuth + RTR까지: 인증 시스템 진화

- 배경: 서명·TTL 없는 `X-Client-Id`는 장기 인증 모델로 부적합, 게스트 연속성과 다중 기기 세션 요구가 겹치며 4단계 진화
- 선택 기준: 게스트 연속성 유지 + XSS·CSRF 위험 최소화 + 다중 기기 세션 허용
- 결과: Memory Access Token + HttpOnly Refresh Token + RTR + Reuse Detection 조합으로 토큰 탈취 대응
- 관련 문서: [FlowMate 인증 시스템 진화: X-Client-Id에서 OAuth + RTR까지](docs/wiki/auth-evolution.md)

### 4) Self-hosted에서 Alloy + Grafana Cloud로 전환

- 문제: Prometheus + Grafana + node-exporter를 직접 운영하면 로그와 트레이스 확장 시 컨테이너와 설정 파일이 계속 늘어남
- 선택 기준: 단일 EC2에서 운영 복잡도를 줄이고, 메트릭·로그·트레이스를 한 수집기 경로로 관리
- 결과: EC2 모니터링 컨테이너를 3개에서 Alloy 1개로 줄이고, Grafana Cloud의 Mimir·Loki·Tempo로 신호를 전송
- 관련 문서: [Self-hosted에서 Alloy + Grafana Cloud로 전환](docs/wiki/monitoring-stack.md)

## 4. 기술 스택

| 영역         | 기술                                                                       |
|------------|--------------------------------------------------------------------------|
| Frontend   | React 19, TypeScript, Zustand, TanStack Query, Tailwind CSS 4, Vite, PWA |
| Backend    | Spring Boot 4, Java 21, Spring Security, JPA, Flyway, MySQL 8            |
| AI Service | NestJS, Gemini API, PostgreSQL 16                                        |
| Infra      | EC2, Docker Compose, Host Nginx, S3, CloudFront, ECR, GitHub Actions     |
| Monitoring | Grafana Cloud, Alloy, Mimir, Loki, Tempo                                 |

## 5. 프로젝트 구조

```txt
FlowMate/
├── frontend/           # React 앱 (Vite + TypeScript)
├── backend/            # Spring Boot API
├── ai-service/         # NestJS AI Service (Gemini KPT 회고 레포트)
├── infra/              # dev/prod 인프라 구성 (Docker Compose, Host Nginx, Alloy)
├── docs/               # 기준 문서 세트 (architecture, data-model, api, wiki)
├── images/             # 로고 및 README 이미지 자산
└── .github/workflows/  # 프론트/백엔드 배포 파이프라인
```
