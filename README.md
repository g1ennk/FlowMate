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
- Spring backend의 report 도메인이 Gemini API로 완료 Todo와 집중 기록 기반 KPT 회고 레포트를 생성합니다 (v1.11.0~).

## 3. 주요 기술 결정

### 1) 인증 시스템 진화: X-Client-Id에서 OAuth + RTR까지

- 배경: 서명·TTL 없는 `X-Client-Id`는 장기 인증 모델로 부적합, 게스트 연속성과 다중 기기 세션 요구가 겹치며 4단계 진화
- 해결: 게스트 연속성 유지 + XSS·CSRF 위험 최소화 + 다중 기기 세션 허용
- 결과: Memory Access Token + HttpOnly Refresh Token + RTR 조합으로 단일 토큰 탈취 차단
- 관련 문서: [FlowMate 인증 시스템 진화: X-Client-Id에서 OAuth + RTR까지](docs/wiki/auth-evolution.md)

### 2) 멀티디바이스 타이머 동기화 — SSE + Redis Pub/Sub

- 문제: 타이머 상태가 Zustand + localStorage로만 관리되어, 같은 계정이어도 기기·탭 간 상태가 공유되지 않는 문제가 발생
- 해결: 서버 → 클라이언트 단방향 push만 필요하므로 SSE + REST를 채택하고, 단조 증가 `version`으로 이벤트 역전을 방지. 이후 수평 확장을 위해 Redis Pub/Sub으로 인스턴스 간 이벤트
  전파를 추가
- 결과: 모든 기기에 즉시 반영되며, 로컬 2-JVM 환경에서 cross-instance 도달률 0%→100% 개선. k6 부하 테스트에서 163,205 req · 에러율 0%를 확인
- 관련 문서: [SSE로 멀티디바이스 타이머 동기화하기](docs/wiki/sse-sync.md) · [Redis Pub/Sub으로 SSE 수평 확장하기](docs/wiki/redis-sse-pubsub.md)

### 3) 운영 관찰성 개선: Self-hosted Prometheus/Grafana에서 Alloy + Grafana Cloud로 전환

- 문제: Spring Boot 운영 지표를 볼 수는 있어야 했지만, Prometheus + Grafana + node-exporter를 직접 운영하면 로그와 트레이스 확장 시 EC2 컨테이너와 설정 파일이 계속
  늘어남
- 해결: 단일 EC2에는 Alloy 수집기 1개만 두고, Spring Boot Actuator 메트릭·Docker 로그·OTel trace를 Grafana Cloud의 Mimir·Loki·Tempo로 전송
- 결과: EC2 모니터링 컨테이너를 3개에서 1개로 줄이고, HTTP/JVM/DB/Host 지표와 로그·트레이스를 Grafana Cloud에서 같은 시간축으로 확인
- 활용: community dashboard(Spring Boot Observability, Node Exporter Full)와 직접 작성한 FlowMate Backend Overview(RED +
  Saturation)로 부하테스트 결과를 해석하고, HikariCP pool 증설 같은 잘못된 튜닝 방향을 걸러냄
- 관련 문서: [운영 관찰성 개선: Self-hosted Prometheus/Grafana에서 Alloy + Grafana Cloud로 전환](docs/wiki/monitoring-stack.md)

## 4. 주요 트러블슈팅

### 1) 타이머 상태 저장의 동시성 제어: InnoDB Deadlock 분석과 해결

- 문제: k6 baseline에서 진행 중인 타이머 상태를 저장하는 `PUT /api/timer/state/{todoId}` 실패 69건이 한 경로에 집중
- 원인: row가 없는 first insert 경로에서 `SELECT FOR UPDATE`가 gap lock을 만들고, 동시 INSERT의 insert intention lock과 충돌
- 해결: `PESSIMISTIC_WRITE`를 제거하고, first insert 유일성 제약 조건 충돌은 winner row 재조회 후 update하는 catch-retry로 복구
- 결과: 수정 후 전체 요청 163,205건 기준 timer PUT 실패 0건, `http_req_failed` 0.00%를 확인
- 관련 문서: [타이머 상태 저장의 동시성 제어: InnoDB Deadlock 분석과 해결](docs/wiki/timer-deadlock.md)

### 2) SSE 연결 유지 실패 분석과 해결: Workbox 충돌과 Nginx 60초 idle timeout

- 문제: SSE 도입 직후 `/api/timer/sse`가 두 단계로 실패 — 먼저 `ERR_FAILED`로 오픈 자체가 막혔고, 이후 200 OK로 열려도 정확히 60초 후 504로 끊김
- 원인: T1은 PWA Workbox가 `/api/*` 전체를 가로채 long-lived SSE 스트림을 처리하지 못함 / T2는 Nginx idle timeout 60초 + Backend heartbeat
  부재 + Spring async timeout 미명시의 3중 구조
- 해결: Workbox runtimeCaching에서 SSE 경로 예외 + Nginx `/api/timer/sse` 전용 location + 25초 heartbeat + `request-timeout 1h` +
  `AsyncRequestTimeoutException` 503 매핑
- 결과: SSE 1시간 이상 안정 유지, nginx 504 / backend `AsyncRequestTimeoutException` 모두 0건
- 관련 문서: [SSE 연결 유지 실패 분석과 해결: Workbox 충돌과 Nginx 60초 idle timeout](docs/wiki/sse-timeout.md)

## 5. 기술 스택

| 영역         | 기술                                                                                 |
|------------|------------------------------------------------------------------------------------|
| Frontend   | React 19, TypeScript, Zustand, TanStack Query, Tailwind CSS 4, Vite, PWA           |
| Backend    | Spring Boot 4, Java 21, Spring Security, JPA, Flyway, MySQL 8, Gemini API (AI 리포트) |
| Infra      | EC2, Docker Compose, Host Nginx, S3, CloudFront, ECR, GitHub Actions               |
| Monitoring | Grafana Cloud, Alloy, Mimir, Loki, Tempo                                           |

## 6. 프로젝트 구조

```txt
FlowMate/
├── frontend/           # React 앱 (Vite + TypeScript)
├── backend/            # Spring Boot API (Gemini KPT 회고 레포트 포함)
├── infra/              # dev/prod 인프라 구성 (Docker Compose, Host Nginx, Alloy)
├── docs/               # 기준 문서 세트 (architecture, data-model, api, wiki)
├── images/             # 로고 및 README 이미지 자산
└── .github/workflows/  # 프론트/백엔드 배포 파이프라인
```
