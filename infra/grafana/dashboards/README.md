# Grafana Dashboards

`flowmate-overview.json` 1개를 git으로 관리한다. Spring Boot Observability, Node Exporter Full 같은 community dashboard는 Grafana
Cloud UI에 import해서 그대로 두고 git에 안 넣는다.

## flowmate-overview.json

5 row, 20 panel. dev/prod 공용이며 `$env` variable로 환경을 고른다.

| Row                           | Panel                                             |
|-------------------------------|---------------------------------------------------|
| Overview (Stat 4)             | Total RPS, Error Rate %, p99 Latency, JVM Heap %  |
| Request Flow (Timeseries 3)   | RPS by Endpoint, Status Code, Latency p50/p95/p99 |
| Database & JVM (Timeseries 4) | HikariCP Pool, JVM Heap, GC Pause, JVM Threads    |
| System (Timeseries 4)         | CPU, Memory, Disk, Network                        |
| SSE 전달 (Timeseries 4, Stat 1) | Redis Publish, Fan-out per Connection, Dispatch Queue, Dropped Dispatch, Connections & Subscriber |

색상 임계치는 yellow가 heap 70% / p99 300ms / error rate 0.5% / CPU 70% / disk 75%, red가 heap 85% / p99 1s / error rate 2% /
CPU 90% / disk 90%.

## SSE 알림 후보

SSE 전달 지표(`flowmate_sse_*`)는 [Redis Pub/Sub 위키의 장애 모드 절](../../../docs/wiki/redis-sse-pubsub.md#6-장애-모드와-보장-범위)에 뜻을 정리했다. 알림을 건다면 아래가 후보다. 임계치는 실측 전이라 출발점이다.

| 알림 | PromQL | 뜻 |
|---|---|---|
| fan-out 작업 버림 | `sum(increase(flowmate_sse_dispatch_dropped_total{environment="prod"}[10m])) > 0` | executor가 포화돼 실시간 전송을 버렸다 |
| 큐 포화 직전 | `min(flowmate_sse_dispatch_queue_remaining{environment="prod"}) < 20` (5분 지속) | 큐 200칸 중 180칸 이상이 차 있다 |
| Redis 발행 실패 | `sum(increase(flowmate_sse_publish_total{environment="prod", result="failure"}[5m])) > 0` | Redis가 응답하지 않아 다른 기기에 실시간 전파가 멈췄다 |
| Redis 구독 끊김 | `min(flowmate_sse_subscriber_listening{environment="prod"}) < 1` (1분 지속) | 이 서버가 채널을 구독하지 못하고 있다 |

## 업데이트 절차

**UI → git**

1. Grafana UI에서 편집 후 Save
2. Dashboard settings → JSON Model → JSON 복사
3. `flowmate-overview.json` 덮어쓰기
4. `git diff` 확인 후 commit

**git → UI**

Grafana → Dashboards → Import → JSON 붙여넣기. 같은 uid면 overwrite 된다.

## 추가 예정

- `flowmate-slo.json` — SLO compliance
