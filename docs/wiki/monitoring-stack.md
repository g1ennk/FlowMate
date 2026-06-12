# 운영 관찰성 개선: Self-hosted Prometheus/Grafana에서 Alloy + Grafana Cloud로 전환

## 요약

- 문제: Spring Boot 운영 지표를 볼 수는 있어야 했지만, Prometheus + Grafana + node-exporter를 직접 운영하면 로그와 트레이스를 붙일수록 EC2 컨테이너와 설정 파일이 계속
  늘어났다.
- 결정: EC2에는 Alloy 수집기 1개만 두고, Spring Boot Actuator 메트릭·Docker 로그·OTel trace를 Grafana Cloud의 Mimir·Loki·Tempo로 보낸다.
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
  ├─ Actuator + Micrometer가 HTTP/JVM/DB 메트릭 누적
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

Backend는 운영 지표를 노출하고, 로그를 stdout으로 쓰고, trace를 Alloy에 보낸다. Alloy는 세 신호를 Grafana Cloud로 전달한다.

## 5. 대시보드 구성

Grafana Cloud에는 세 종류의 대시보드를 둔다.

| 대시보드                      | 출처               | 용도                                         | Git 관리 |
|---------------------------|------------------|--------------------------------------------|--------|
| Spring Boot Observability | Community import | HTTP 요청, JVM heap, GC, thread, HikariCP 확인 | 아니오    |
| Node Exporter Full        | Community import | CPU, memory, disk, network 같은 host 지표 확인   | 아니오    |
| FlowMate Backend Overview | 직접 작성            | 매일 보는 1차 RED + Saturation 대시보드             | 예      |

기존 community dashboard는 이미 표준화된 패널이 많아 그대로 import했다. 대신 FlowMate에서 자주 보는 질문은 별도 대시보드로 묶었다.

- 지금 요청이 들어오고 있는가?
- 실패율이 튀는가?
- p99 latency가 임계치를 넘는가?
- JVM heap, GC, thread가 버티는가?
- HikariCP pool이 대기열을 만들고 있는가?
- EC2 host CPU, memory, disk, network가 포화되는가?

이 질문에 맞춰 `infra/grafana/dashboards/flowmate-overview.json`을 git으로 관리한다.

### 1. Spring Boot Observability

![flowmate-sprin-boot-observerbility.png](../../images/flowmate-sprin-boot-observerbility.png)

### 2. Node Exporter Full

![flowmate-node-exporter.png](../../images/flowmate-node-exporter.png)

### 3. FlowMate Backend Overview

![flowmate-custom-dashboard.png](../../images/flowmate-custom-dashboard.png)

| Row            | Panel                                             |
|----------------|---------------------------------------------------|
| Overview       | Total RPS, Error Rate %, p99 Latency, JVM Heap %  |
| Request Flow   | RPS by Endpoint, Status Code, Latency p50/p95/p99 |
| Database & JVM | HikariCP Pool, JVM Heap, GC Pause, JVM Threads    |
| System         | CPU, Memory, Disk, Network                        |

## 6. 부하테스트에서의 활용

### 6.1 v1: timer state deadlock 특정

2026-03-26 broad baseline에서는 전역 threshold만 보면 통과에 가까웠다.

| 항목                |        값 |
|-------------------|---------:|
| baseline 전체 요청    | 112,132건 |
| `http_req_failed` |    0.06% |
| p95               |  64.62ms |
| p99               | 157.58ms |

하지만 endpoint별 실패 분포를 보면 `PUT /api/timer/state/{todoId}`에 실패 69건이 집중됐다.

Grafana에서는 같은 시간대에 `/api/timer/state/{todoId}` 5xx와 exception이 튀었고, HikariCP pending, JVM heap/GC/thread, host pressure는
포화 신호가 아니었다. 원격 backend log에서는 MySQL deadlock이 확인됐다.

즉, "서버 전체가 느려졌다"가 아니라 "타이머 상태 저장 경로의 first insert 동시성 문제"로 좁혀졌다. 이후 `PESSIMISTIC_WRITE` 제거와 first insert 충돌
catch-retry로 수정했고, 재측정에서 timer PUT 실패 0건을 확인했다.

### 6.2 v3/v4: pool 문제가 아니라 host 한계로 재분류

2026-05 breakpoint test에서는 처음에 HikariCP pending이 크게 보여서 pool size가 1차 원인처럼 보였다.

| 관찰                                | 의미                     |
|-----------------------------------|------------------------|
| HikariCP active 10/10, pending 증가 | pool 대기열 발생            |
| JVM heap 약 20%, GC pause 짧음       | heap/GC 병목 아님          |
| slow query log 0건                 | 개별 SQL이 1초 이상 느린 상황 아님 |
| host CPU 100% 지속, load 증가         | EC2 host 자원 포화         |

여기서 바로 pool을 키우지 않고 v4에서 Hikari pool을 10 → 20으로 바꿔 같은 breakpoint test를 다시 돌렸다. 결과는 throughput 25% 감소, 무너지는 시점이 앞당겨졌다.

이 추가 측정으로 Hikari pending은 원인이 아니라 host 스펙 자체가 한계에 닿아 생긴 원인으로 특정했다.
따라서 pool 튜닝과 thread 튜닝은 제외하고, 인스턴스 스펙을 올리거나, DB hit 자체를 줄이는 Redis나 MySQL 분리 같은 방향으로 방향성을 잡을 수 있었다.

## 7. 결과

| 항목            | 전                                               | 후                                         |
|---------------|-------------------------------------------------|-------------------------------------------|
| EC2 모니터링 컨테이너 | 3개: prometheus, grafana, node-exporter          | 1개: alloy                                 |
| 설정 파일         | 핵심 파일 4개, dashboard/rule/provisioning 포함 시 10개+ | dev/prod `config.alloy` 2개                |
| Grafana UI 보안 | nginx 프록시와 접근 제어 필요                             | Cloud UI 사용, EC2에서 직접 노출 안 함              |
| 운영 지표 확인      | 메트릭 중심                                          | HTTP/JVM/DB/Host + 로그 + trace를 같은 UI에서 확인 |
| 부하테스트 해석      | k6 summary 중심                                   | k6 결과와 runtime 지표를 같은 시간축에서 비교            |
| 대시보드 관리       | UI 수동 설정 중심                                     | FlowMate custom dashboard 1개를 JSON으로 관리   |

이번 작업의 결과는 성능 개선을 위한 관찰 기준을 확보한 것으로 실제 v3/v4에서는 측정 덕분에 Hikari pool 증가라는 잘못된 튜닝 방향을 걸러낼 수 있었다.

## 8. 트레이드오프

| 결정                     | 얻은 것                        | 감수한 비용                     | 현재 판단                  |
|------------------------|-----------------------------|----------------------------|------------------------|
| Grafana Cloud 무료 플랜    | Grafana/Prometheus 직접 운영 제거 | active series 10k 한도 관리 필요 | 개인 규모에 맞지만 지속 관리 대상    |
| Alloy 단일 수집기           | 컨테이너 1개로 3신호 처리             | Alloy 설정 오류가 3신호에 함께 영향    | 단일 EC2 규모에서는 단순성이 더 큼  |
| Docker 로그 수집           | 앱은 stdout만 알면 됨             | docker socket read 권한 필요   | 현재 규모에서는 수용            |
| Community dashboard 활용 | 빠르게 HTTP/JVM/Host 지표 확인 가능  | 프로젝트 특화 질문은 직접 보완해야 함      | import + custom 병행이 적절 |
| Trace 샘플링              | Tempo 사용량 절감                | 드문 느린 요청 trace가 안 잡힐 수 있음  | prod 10%, dev 100%로 운영 |

Grafana Cloud 무료 플랜은 "완전히 신경 쓰지 않아도 되는 무료"가 아니다. 실제로 active series가 한도 근처까지 오른 적이 있어, Alloy drop rule과 unix exporter
collector 축소로 줄였다. 앞으로도 histogram bucket 조정 같은 라벨 조합 수(cardinality) 관리는 필요하다.

## 9. 회고

### 복잡도는 쌓이기 전에 줄이는 편이 싸다

Self-hosted Prometheus + Grafana는 동작했다. 문제는 다음 단계였다.

로그와 트레이스를 붙인 뒤에 정리했다면 컨테이너와 설정 파일이 더 늘어난 상태에서 마이그레이션해야 했다. Phase 1이 끝나고 Phase 2를 붙이기 전이 전환 비용이 가장 낮은 시점이었다.

이번 결정의 핵심은 비용 절감보다 운영 단순화였다. EC2는 앱 실행과 데이터 수집만 담당하고, 저장·조회·대시보드는 Grafana Cloud에 맡기는 쪽이 현재 FlowMate 규모에 더 잘 맞았다.

### Observability에 대한 공부가 더 필요하다

이번 전환으로 메트릭, 로그, 트레이스를 한곳에서 확인하고 관리할 수 있는 기반은 만들었다. 하지만 이것만으로 Observability를 안다고 말할 수는 없었다.

실제로 대시보드를 구성하고 부하테스트를 하면서 느낀 것은, 제대로 이해하지 못한 지표가 많다는 점이었다. 그렇다 보니 대시보드를 완성해도, 부하테스트를 진행해도 쉽게 원인을 특정하기 어려웠다. HikariCP
pending, JVM heap, GC pause, host CPU, slow query log 같은 지표를 함께 놓고 해석해야 했고, 어떤 지표가 원인이고 어떤 지표가 결과인지 구분하는 과정이 필요했다.

결국 Observability를 제대로 활용하려면 도구보다 먼저 지표에 대한 이해가 필요하다는 생각이 들었다. 각 지표가 무엇을 의미하는지, 정상 범위와 이상 신호는 어떻게 구분하는지, 그리고 하나의 지표 변화가
다른 지표들과 어떤 연관관계를 가지는지 알아야 문제를 더 정확히 좁힐 수 있다. 앞으로는 JVM, DB connection pool, host resource, HTTP latency 같은 지표들의 개념과 관계를 더
공부하면서 운영 상황을 해석하는 힘을 키워야겠다.
