# FlowMate 아키텍처

> Last updated: 2026-04-28
>
> 관련 문서: [API Reference](api.md) · [Data Model](data-model.md)

## 1. AWS 기반 시스템 아키텍처

- 프론트엔드는 S3 + CloudFront를 통해 정적 React SPA로 제공한다.
- API 요청은 별도 도메인으로 EC2의 호스트 Nginx에 진입하며, Nginx가 TLS 종료와 reverse proxy를 담당한다.
- 백엔드는 Docker Compose 기반으로 backend, mysql, ai-service(NestJS), postgres, alloy 컨테이너로 구성되며, Spring Boot는 127.0.0.1:8080, AI Service는 127.0.0.1:3000으로만 노출된다.
- Alloy는 메트릭과 로그를 Grafana Cloud로 전송하고, trace 수집을 위한 OTLP 경로도 준비돼 있다.

```mermaid
flowchart LR
    Browser["Browser"]
    CDN["S3 + CloudFront<br/>React SPA"]
    Nginx["Host Nginx<br/>TLS termination · reverse proxy"]

    subgraph EC2["EC2 (Ubuntu)"]
        direction TB
        subgraph Compose["Docker Compose"]
            Backend["Spring Boot API<br/>127.0.0.1:8080"]
            MySQL[("MySQL 8.0")]
            AIService["NestJS AI Service<br/>127.0.0.1:3000"]
            Postgres[("PostgreSQL 16")]
            Alloy["Grafana Alloy"]
        end
    end

    Grafana["Grafana Cloud<br/>Mimir · Loki · Tempo"]
    Browser <-->|정적 자산| CDN
    Browser -->|HTTPS /api/*| Nginx
    Nginx -->|proxy_pass /api/ai| AIService
    Nginx -->|proxy_pass /api/*| Backend
    Backend --> MySQL
    AIService --> Postgres
    AIService -->|내부 API 호출| Backend
    Backend -->|/actuator/prometheus| Alloy
    Backend -.->|OTLP traces| Alloy
    Alloy -->|metrics · logs| Grafana
```

- `/api/timer/sse`는 Nginx에서 별도 location으로 분리하고, proxy buffering을 비활성화해 장기 연결을 유지한다.
- 외부 health check는 `/actuator/health`만 허용하고, 나머지 actuator 경로는 Nginx에서 차단한다.

## 2. 인증 아키텍처

### 1) 토큰 전략

| 토큰                | 저장 위치                    | TTL | 목적                  |
|-------------------|--------------------------|-----|---------------------|
| Guest JWT         | localStorage             | 90일 | 비로그인 사용자 식별 및 상태 유지 |
| Member Access JWT | 브라우저 메모리                 | 15분 | API 인가              |
| State JWT         | sessionStorage (콜백 후 삭제) | 5분  | OAuth CSRF 방지       |
| Refresh Token     | HttpOnly 쿠키              | 14일 | Access JWT 재발급      |

- 현재 OAuth 공급자는 `kakao`만 지원한다.
- State JWT는 클라이언트가 콜백 검증 직후 sessionStorage에서 즉시 제거하며, 서버는 state를 별도로 저장하지 않고 서명 검증만 수행한다.
- Refresh Token은 DB에 평문이 아니라 SHA-256 해시로 저장하고, 재발급 시에는 기존 토큰을 revoke한 뒤 새 토큰으로 교체한다.

### 2) OAuth 로그인 플로우 & Refresh Token Rotation

```mermaid
sequenceDiagram
    participant C as Client
    participant S as FlowMate API
    participant K as Kakao
    participant DB as MySQL

    rect rgb(235, 245, 255)
        Note over C, DB: OAuth 로그인
        C ->> S: GET /api/auth/kakao/authorize-url
        S -->> C: State JWT (TTL 5분) + Kakao OAuth URL
        Note over C: sessionStorage에 State JWT 저장
        C ->> K: 브라우저 리다이렉트
        K -->> C: 콜백 (code + state)
        Note over C: URL state와 sessionStorage의 State JWT 비교
        C ->> S: POST /api/auth/kakao/exchange { code, state }
        S ->> S: State JWT 서명 검증
        S ->> K: 토큰 교환 + 사용자 정보 조회
        S ->> DB: users / auth_social_accounts 저장 또는 갱신
        S ->> S: 신규 Refresh Token 생성
        S ->> DB: Refresh Token 해시 저장
        S -->> C: Access Token + HttpOnly Refresh Token 쿠키 설정
        Note over C: 검증 후 State JWT 즉시 삭제
    end

    rect rgb(255, 245, 235)
        Note over C, DB: Refresh Token Rotation
        C ->> S: POST /api/auth/refresh (쿠키에 RT 자동 포함)
        S ->> DB: SHA-256 해시로 RT 조회
        S ->> S: revoked / expired 여부 검증
        S ->> S: 신규 Refresh Token 생성
        S ->> DB: 기존 RT revoke + 신규 RT 해시 저장
        S -->> C: 신규 Access Token + 신규 Refresh Token 쿠키 설정
        Note over C, S: 이미 폐기된 RT로는 재발급이 성공하지 않음
    end
```

- Guest 사용자는 Guest JWT로 시작하고, 회원 로그인 후에는 Member Access JWT + Refresh Token 조합으로 전환된다.
- refresh 시 기존 RT를 즉시 revoke하고 새 RT로 교체하므로, 이미 폐기된 RT로는 이후 재발급이 성공하지 않는다.
- 폐기된 RT로 재사용을 시도하면 401로 차단한다.
- 로그인은 기존 활성 RT를 유지한 채 새 RT를 추가 발급한다. 같은 회원이 여러 디바이스에서 동시에 세션을 유지할 수 있으며, SSE 멀티디바이스 동기화 전제와 정합한다.

## 3. SSE 아키텍처

- SSE 엔드포인트는 Member Access JWT 기반 로그인 사용자 전용이다.
- EventSource가 Authorization 헤더를 지원하지 않아 `GET /api/timer/sse?token={accessToken}` 형태를 사용한다.
- 같은 회원의 여러 탭과 기기에 timer-state 이벤트를 브로드캐스트한다

```mermaid
sequenceDiagram
    participant D as Desktop Browser
    participant N as Host Nginx
    participant S as Spring Boot
    participant R as SseEmitterRegistry
    participant M as Mobile Browser
    D ->> N: GET /api/timer/sse?token=accessToken
    Note over N: proxy_buffering off<br/>X-Accel-Buffering no<br/>proxy_read_timeout 3600s
    N ->> S: proxy request
    S ->> S: Access Token 검증 + member role 확인
    S ->> R: register(userId)
    R -->> D: connected
    Note over R: userId -> List(SseEmitter)<br/>timeout 1시간<br/>heartbeat 약 25초
    M ->> N: GET /api/timer/sse?token=accessToken
    N ->> S: proxy request
    S ->> S: Access Token 검증 + member role 확인
    S ->> R: register(userId)
    R -->> M: connected
    D ->> S: PUT /api/timer/state/{todoId}
    S ->> S: 상태 저장 + version 갱신
    S ->> R: broadcast(userId, timer-state)
    R -->> D: timer-state
    R -->> M: timer-state
```

- `connected`와 `heartbeat`는 연결 유지 및 생존 확인용 이벤트이며, 클라이언트 상태 동기화에는 `timer-state`만 반영한다.
- 서버는 타이머 상태를 저장한 뒤 같은 `userId`에 연결된 모든 SSE emitter로 최신 상태를 브로드캐스트한다.

## 4. 인프라 및 배포

### 1) 배포 프로세스

| 환경   | 프론트엔드                                       | 백엔드                                                        | AI Service                                                |
|------|---------------------------------------------|------------------------------------------------------------|-----------------------------------------------------------|
| Dev  | `main` push → S3 sync + CloudFront invalidation | `main` push → ECR build → EC2 SSH deploy                  | `main` push → ECR build → EC2 SSH deploy                  |
| Prod | tag `v*.*.*` push → S3 sync + CloudFront invalidation | tag push → ECR build (tag + latest) → EC2 SSH deploy | tag push → ECR build (tag) → EC2 SSH deploy               |

- `main` push 한 번으로 dev 환경 세 서비스가 동시 갱신된다.
- tag `v*.*.*` push 한 번으로 prod 환경 세 서비스가 동시 자동 배포된다. glob 가드로 `archive/*` · `pre-release/*` · `hotfix/*` 등 비-semver tag는 prod 트리거 안 됨.
- 코드는 동일하고 환경 차이는 `infra/{dev,prod}/` 디렉토리 + Spring profile + 환경변수로 흡수한다.

### 2) CI/CD 파이프라인

```mermaid
flowchart TD
    subgraph Dev["Dev — main push 자동"]
        D0["push to main"] --> D1["Frontend<br/>pnpm build → S3 + CF"]
        D0 --> D2["Backend<br/>ECR build → SSH deploy"]
        D0 --> D3["AI Service<br/>ECR build → SSH deploy"]
    end

    subgraph Prod["Prod — tag v*.*.* push 자동"]
        P0["push tag"] --> P1["Frontend<br/>pnpm build → S3 + CF"]
        P0 --> P2["Backend<br/>ECR (tag + latest) → SSH deploy"]
        P0 --> P3["AI Service<br/>ECR (tag) → SSH deploy"]
    end
```

### 3) 모델 변천

- **v1.8 ~ v1.9 (2026-05-14 폐기)**: `develop` + `main` + squash + backmerge. 1인 운영에 매 릴리즈 5단계 + backmerge 누락 사고 (2026-04-08).
- **v1.10~ (현재)**: `main` 단일 + tag 기반 prod (GitHub Flow 변형). 릴리즈 단계 5 → 1~2, FE/BE/AI 동기화, `docs/review/2026-05-10.md` INF-H3 (prod-backend build/deploy 분리 버그) 해결.