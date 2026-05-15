# Self-hosted에서 Alloy + Grafana Cloud로 전환

## 요약

- 문제: Prometheus + Grafana + node-exporter를 직접 운영하면 로그와 트레이스를 붙일수록 컨테이너와 설정 파일이 계속 늘어났다.
- 결정: EC2에는 Alloy 수집기 1개만 두고, 메트릭·로그·트레이스는 Grafana Cloud의 Mimir·Loki·Tempo로 보낸다.
- 결과: 모니터링 컨테이너는 3개에서 1개로 줄었고, 이후 확장은 대부분 `config.alloy`와 backend 설정 변경으로 처리할 수 있게 됐다.

## 1. 문제: 직접 운영의 확장 비용

FlowMate는 EC2 + Docker Compose로 운영된다. 초기 모니터링도 같은 EC2 안에서 시작했다.

```text
EC2
├── backend (Spring Boot)
├── mysql
├── prometheus     ← 메트릭 수집/저장
├── grafana        ← 시각화
└── node-exporter  ← 시스템 메트릭
```

Prometheus + Grafana 조합은 표준적이고 무료이며 Docker 이미지로 바로 띄울 수 있다. 메트릭만 볼 때는 충분히 합리적인 선택이었다.

하지만 다음 단계가 문제였다.

| 문제      | 내용                                                                  | 영향               |
|---------|---------------------------------------------------------------------|------------------|
| 설정 중복   | dev/prod에 거의 같은 Prometheus, Grafana provisioning, dashboard 설정이 반복됨 | 한쪽만 수정하는 실수 발생   |
| 컨테이너 증가 | 로그에는 Loki/Promtail, 트레이스에는 Tempo가 추가됨                               | 단일 EC2 메모리 부담 증가 |
| 보안 표면   | self-hosted Grafana를 외부에서 보려면 nginx 프록시와 접근 제어가 필요함                 | 운영 설정 복잡도 증가     |

## 2. 선택: Grafana Cloud + Alloy

검토한 방향은 두 가지였다.

| 대안                    | 장점                               | 단점                       | 판단 |
|-----------------------|----------------------------------|--------------------------|----|
| Self-hosted 유지        | 외부 의존 적음, EC2 비용 외 추가 비용 없음      | 컨테이너와 설정 파일이 계속 증가       | 보류 |
| Grafana Cloud + Alloy | EC2에는 수집기 1개만 유지, UI는 Cloud에서 사용 | 무료 플랜 한도와 Alloy 설정 학습 필요 | 채택 |

Grafana Cloud를 쓰면 역할이 분리된다.

- EC2: Alloy가 데이터만 수집한다.
- Grafana Cloud: Mimir(메트릭), Loki(로그), Tempo(트레이스), 대시보드 UI를 담당한다.
- Nginx: Grafana UI를 직접 노출하지 않는다.

이 구조가 현재 규모에 더 맞았다. 기능을 더 붙이기 전에 운영 복잡도를 줄이는 쪽이 더 싸다고 판단했다.

## 3. 전환 내용

### 제거한 것

```text
infra/dev/config/prometheus/
infra/dev/config/grafana/
infra/prod/config/prometheus/
infra/prod/config/grafana/

docker-compose 서비스: prometheus, grafana, node-exporter
docker volume: prometheus-data, grafana-data
nginx: /grafana/ 프록시 블록
```

### 추가한 것

```text
infra/dev/config/alloy/config.alloy
infra/prod/config/alloy/config.alloy
```

`config.alloy` 하나가 네 가지 일을 한다.

```hcl
prometheus.scrape        // Spring Boot Actuator 메트릭
prometheus.exporter.unix // 호스트 시스템 메트릭
loki.source.docker       // Docker 컨테이너 로그
otelcol.receiver.otlp    // OTel trace 수신
```

전송 방식은 신호마다 다르다.

| 신호      | Alloy 컴포넌트                | Grafana Cloud 목적지 |
|---------|---------------------------|-------------------|
| Metrics | `prometheus.remote_write` | Mimir             |
| Logs    | `loki.write`              | Loki              |
| Traces  | `otelcol.exporter.otlp`   | Tempo             |

## 4. 현재 데이터 흐름

Spring Boot 요청 하나에서 세 신호는 아래처럼 흐른다.

```text
사용자 요청
  ↓ HTTPS
CloudFront → Host Nginx → Docker bridge
  ↓
Spring Boot (Java 21)
  │
  ├─ Micrometer가 메트릭 누적
  │     ↑ Alloy가 15초마다 /actuator/prometheus pull
  │
  ├─ SLF4J → Logback JSON encoder → stdout
  │     ↓ Docker logging driver(json-file)
  │     ↓ Alloy가 docker socket으로 tail
  │
  └─ OTel Java agent가 HTTP/JDBC/JPA span 자동 생성
        ↓ OTLP HTTP batch
        → alloy:4318/v1/traces

Alloy
  ├─ Metrics → Mimir
  ├─ Logs    → Loki
  └─ Traces  → Tempo
```

| 신호      | 방식   | 누가 능동적인가                         | 이유                            |
|---------|------|----------------------------------|-------------------------------|
| Metrics | Pull | Alloy → backend                  | 시계열은 일정 주기 샘플링이 필요하다.         |
| Logs    | 간접   | backend는 stdout만 출력, Alloy가 tail | 앱은 로그 저장 위치를 몰라도 된다.          |
| Traces  | Push | OTel agent → Alloy               | 요청 이벤트가 발생한 시점에 보내는 것이 자연스럽다. |

Backend는 메트릭을 노출하고, 로그를 stdout으로 쓰고, trace를 Alloy에 보낸다. Alloy는 세 신호를 Grafana Cloud로 전달한다.

## 5. 결과

| 항목            | 전                                               | 후                            |
|---------------|-------------------------------------------------|------------------------------|
| EC2 모니터링 컨테이너 | 3개: prometheus, grafana, node-exporter          | 1개: alloy                    |
| 설정 파일         | 핵심 파일 4개, dashboard/rule/provisioning 포함 시 10개+ | dev/prod `config.alloy` 2개   |
| Grafana UI 보안 | nginx 프록시와 접근 제어 필요                             | Cloud UI 사용, EC2에서 직접 노출 안 함 |
| 로그/트레이스 확장    | Loki, Promtail, Tempo 컨테이너 추가                   | Alloy 설정과 backend 계측 설정으로 확장 |

## 6. 트레이드오프

| 결정                  | 얻은 것                        | 감수한 비용                     | 현재 판단                  |
|---------------------|-----------------------------|----------------------------|------------------------|
| Grafana Cloud 무료 플랜 | Grafana/Prometheus 직접 운영 제거 | active series 10k 한도 관리 필요 | 개인 규모에 맞지만 지속 관리 대상    |
| Alloy 단일 수집기        | 컨테이너 1개로 3신호 처리             | Alloy 설정 오류가 3신호에 함께 영향    | 단일 EC2 규모에서는 단순성이 더 큼  |
| Docker 로그 수집        | 앱은 stdout만 알면 됨             | docker socket read 권한 필요   | 현재 규모에서는 수용            |
| Trace 샘플링           | Tempo 사용량 절감                | 드문 느린 요청 trace가 안 잡힐 수 있음  | prod 10%, dev 100%로 운영 |

Grafana Cloud 무료 플랜은 "완전히 신경 쓰지 않아도 되는 무료"가 아니다. 실제로 active series가 한도 근처까지 오른 적이 있어, Alloy drop rule과 unix exporter
collector 축소로 줄였다. 앞으로도 histogram bucket 조정 같은 라벨 조합 수(cardinality) 관리는 필요하다.

## 7. 회고

### 복잡도는 쌓이기 전에 줄이는 편이 싸다

Self-hosted Prometheus + Grafana는 동작했다. 문제는 다음 단계였다.

로그와 트레이스를 붙인 뒤에 정리했다면 컨테이너와 설정 파일이 더 늘어난 상태에서 마이그레이션해야 했다. Phase 1이 끝나고 Phase 2를 붙이기 전이 전환 비용이 가장 낮은 시점이었다.

이번 결정의 핵심은 비용 절감보다 운영 단순화였다. EC2는 앱 실행과 데이터 수집만 담당하고, 저장·조회·대시보드는 Grafana Cloud에 맡기는 쪽이 현재 FlowMate 규모에 더 잘 맞았다.
