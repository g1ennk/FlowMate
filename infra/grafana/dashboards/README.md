# FlowMate Grafana Dashboards

자체 제작한 Grafana dashboard JSON을 git으로 관리하는 디렉토리. "Dashboard as Code" 패턴.

## 파일

| 파일 | 역할 | 출처 |
|---|---|---|
| `flowmate-overview.json` | 매일 보는 1차 Overview dashboard | 자체 제작 |

## 자체 제작 vs 외부 import

| Dashboard | 관리 위치 |
|---|---|
| **FlowMate Backend Overview** (자체) | git ⭐ |
| Spring Boot Observability (community, generic) | git X (reference 용) |
| Node Exporter Full (community, generic) | git X (reference 용) |

자체 제작한 1개만 git 관리. 외부 community dashboard는 별도 관리 없이 Grafana Cloud UI에 그대로 유지.

## flowmate-overview.json — 구조

4 row, 16 panels.

```
🎯 Overview — 지금 잘 작동하나?  (Stat 4)
   ├─ Total RPS (excl. /actuator)
   ├─ Error Rate %
   ├─ p99 Latency (excl. SSE)
   └─ JVM Heap %

📡 Request Flow — 어디가 바쁘고 어디가 실패하나  (Timeseries 3)
   ├─ RPS by Endpoint
   ├─ Status Code Distribution (stacked bars)
   └─ Latency Percentiles p50/p95/p99

🗄 Database & JVM — 자원 포화도  (Timeseries 4)
   ├─ HikariCP Connection Pool (active/idle/pending)
   ├─ JVM Heap Used vs Max
   ├─ GC Pause Time / sec
   └─ JVM Threads

🖥 System — 호스트 자원  (Timeseries 4)
   ├─ CPU Usage %
   ├─ Memory Usage (used / available / swap_used)
   ├─ Disk Usage % (root)
   └─ Network Traffic (eth0)
```

### Variables

- `$env` — `dev` 또는 `prod` (default: prod)
- `$datasource_prom` — Prometheus datasource (hidden, `grafanacloud-prom` 고정)

### 색상 임계치

- 🟢 Green: 정상
- 🟡 Yellow: warning (예: heap 70%, p99 300ms)
- 🔴 Red: critical (예: heap 85%, p99 1s, error rate 2%)

## 업데이트 방법

### UI에서 수정 → git 반영

1. Grafana UI에서 dashboard 편집
2. Save dashboard
3. Dashboard settings → JSON Model 열기
4. JSON 복사 → `flowmate-overview.json` 덮어쓰기
5. `git diff` 검토 후 commit

### git에서 수정 → UI 반영

1. `flowmate-overview.json` 편집
2. Grafana → Dashboards → Import → JSON 붙여넣기 (uid 같으면 overwrite)

## 향후 추가 예정

- `flowmate-slo.json` — SLO Compliance dashboard (Phase C)
- `flowmate-sse.json` — SSE 도메인 특수 dashboard (Phase B)
