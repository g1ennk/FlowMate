# Grafana Dashboards

`flowmate-overview.json` 1개를 git으로 관리한다. Spring Boot Observability, Node Exporter Full 같은 community dashboard는 Grafana
Cloud UI에 import해서 그대로 두고 git에 안 넣는다.

## flowmate-overview.json

4 row · 15 panel. dev/prod 공용이며 `$env` variable로 환경을 고른다.

| Row                           | Panel                                             |
|-------------------------------|---------------------------------------------------|
| Overview (Stat 4)             | Total RPS, Error Rate %, p99 Latency, JVM Heap %  |
| Request Flow (Timeseries 3)   | RPS by Endpoint, Status Code, Latency p50/p95/p99 |
| Database & JVM (Timeseries 4) | HikariCP Pool, JVM Heap, GC Pause, JVM Threads    |
| System (Timeseries 4)         | CPU, Memory, Disk, Network                        |

색상 임계치는 yellow가 heap 70% / p99 300ms / error rate 0.5% / CPU 70% / disk 75%, red가 heap 85% / p99 1s / error rate 2% /
CPU 90% / disk 90%.

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
- `flowmate-sse.json` — SSE 도메인 전용
