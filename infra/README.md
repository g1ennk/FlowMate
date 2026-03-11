# FlowMate Infrastructure

> 상태: current
> 역할: FlowMate 배포/운영 구조 가이드. 애플리케이션 계약 문서는 `docs/plan/*`를 따른다.

FlowMate 프론트엔드는 Docker가 아니라 S3 + CloudFront에서 서빙하고, API는 EC2 + Docker Compose + Host Nginx로 운영한다.

## 아키텍처

- Frontend (Dev/Prod): S3 + CloudFront
- Backend API (Dev/Prod): EC2 + Docker Compose
- Reverse Proxy/TLS: Host Nginx + Certbot (REST + member timer SSE 프록시)
- DB: MySQL
- Observability: Grafana Alloy → Grafana Cloud (Mimir / Loki / Tempo)

도메인:

- Dev Frontend: `https://dev.flowmate.io.kr`
- Prod Frontend: `https://flowmate.io.kr`
- Dev API: `https://api.dev.flowmate.io.kr`
- Prod API: `https://api.flowmate.io.kr`

## 디렉토리 구조

```txt
infra/
├── dev/
│   ├── .env
│   ├── docker-compose.yml
│   └── config/
│       ├── alloy/config.alloy   ← 메트릭/로그/트레이스 수집
│       └── nginx/nginx.conf
├── prod/
│   ├── .env
│   ├── docker-compose.yml
│   └── config/
│       ├── alloy/config.alloy
│       └── nginx/nginx.conf
└── README.md
```

## 빠른 시작

### Dev

```bash
cd infra/dev
vim .env
docker compose up -d --build
```

확인:

- Backend health: `http://127.0.0.1:8080/actuator/health`
- Alloy UI: `http://127.0.0.1:12345`

### Prod

```bash
cd infra/prod
vim .env
ECR_IMAGE_URI=<ecr-image-uri:tag> docker compose up -d
```

확인:

- Backend health: `http://127.0.0.1:8080/actuator/health`
- Alloy UI (SSH 터널): `ssh -L 12345:localhost:12345 ubuntu@<PROD_EC2>` 후 `http://localhost:12345`

## Host Nginx + Certbot

Dev/Prod 공통으로 nginx와 certbot은 호스트에서 직접 관리한다.

현재 host nginx는 일반 REST `/api` 프록시와 별도로 member 타이머 SSE(`/api/timer/sse`)를 전용 `location`으로 분리한다.

- `/api/timer/sse`
  - `proxy_buffering off`
  - `X-Accel-Buffering no`
  - 긴 `proxy_read_timeout` / `proxy_send_timeout`
- 이유: SSE는 long-lived stream이라 일반 REST용 60초 timeout/버퍼링 정책과 분리해야 한다.

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot
```

### Dev nginx 적용

```bash
sudo cp infra/dev/config/nginx/nginx.conf /etc/nginx/sites-available/flowmate-api-dev.conf
sudo ln -sf /etc/nginx/sites-available/flowmate-api-dev.conf /etc/nginx/sites-enabled/flowmate-api-dev.conf
sudo nginx -t
sudo systemctl reload nginx
```

### Prod nginx 적용

```bash
sudo cp infra/prod/config/nginx/nginx.conf /etc/nginx/sites-available/flowmate-api-prod.conf
sudo ln -sf /etc/nginx/sites-available/flowmate-api-prod.conf /etc/nginx/sites-enabled/flowmate-api-prod.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 인증서 발급/갱신

```bash
sudo certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email <your-email> \
  --agree-tos \
  -d api.dev.flowmate.io.kr

sudo certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email <your-email> \
  --agree-tos \
  -d api.flowmate.io.kr

sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 서비스 구성

| 서비스 | Dev | Prod | 설명 |
|---|---|---|---|
| backend | 내부 | 내부 | Spring Boot API |
| mysql | 내부 | 내부 | 데이터베이스 |
| alloy | 12345 노출 | 127.0.0.1:12345 | 메트릭/로그/트레이스 수집 → Grafana Cloud |

## Grafana Cloud 관측성

Alloy 에이전트가 수집한 데이터를 Grafana Cloud로 push한다.

| 대상 | 수집 방식 | 저장소 |
|------|----------|--------|
| Spring Boot 메트릭 | Prometheus scrape (15s) | Grafana Cloud Mimir |
| 시스템 메트릭 | prometheus.exporter.unix | Grafana Cloud Mimir |
| 컨테이너 로그 | loki.source.docker | Grafana Cloud Loki |
| 트레이스 (Phase 4) | OTLP gRPC 4317 / HTTP 4318 | Grafana Cloud Tempo |

대시보드 (Grafana Cloud UI):
- **Spring Boot Observability** (ID: 17175) — HTTP 요청, 레이턴시, JVM
- **Node Exporter Full** (ID: 1860) — CPU, Memory, Disk, Network

Alloy 운영 명령:
```bash
# dev: alloy만 재시작
docker compose up -d --no-deps alloy

# prod: ECR_IMAGE_URI 주입 필요
ECR_IMAGE_URI=<URI> docker compose up -d --no-deps alloy
```

## 프론트엔드 배포

프론트엔드는 EC2가 아닌 S3 + CloudFront에서 서빙한다.

### Dev 빌드/배포

```bash
cd frontend
pnpm build --mode dev
aws s3 sync dist/ s3://flowmate-dev-frontend --delete
aws cloudfront create-invalidation --distribution-id ELD3D7OCSS5QS --paths "/*"
```

### Prod 빌드/배포

```bash
cd frontend
pnpm build --mode prod
aws s3 sync dist/ s3://flowmate-prod-frontend --delete
aws cloudfront create-invalidation --distribution-id <prod-distribution-id> --paths "/*"
```

## 운영 명령어

```bash
# 로그 확인
cd infra/dev && docker compose logs -f backend mysql alloy
cd infra/prod && docker compose logs -f backend mysql alloy

# 재시작
cd infra/dev && docker compose up -d
cd infra/prod && ECR_IMAGE_URI=<URI> docker compose up -d

# 종료
cd infra/dev && docker compose down
cd infra/prod && docker compose down
```

## 보안 체크

- `infra/dev/.env`, `infra/prod/.env`는 커밋 금지
- Prod는 강한 비밀번호 사용
- Prod에서 MySQL 외부 포트 미노출 유지
- Prod Alloy UI는 `127.0.0.1:12345`로 로컬 바인딩 (SSH 터널로만 접근)
- Host nginx에서 `/actuator/health` 외 Actuator 차단 유지 (dev/prod 공통)

## 트러블슈팅

1. `unknown host` DB 에러
   `DB_HOST`가 compose 네트워크 기준 주소인지 확인한다.

2. 인증서 에러
   `DOMAIN_NAME`과 nginx `server_name`이 일치하는지 확인한다.

3. `/api/timer/sse`가 60초 전후에 끊김
   host nginx에 `/api/timer/sse` 전용 `location`, `proxy_buffering off`, 긴 `proxy_read_timeout`이 반영됐는지 확인한다.

4. API는 뜨는데 프론트가 안 뜸
   정상이다. 프론트는 S3 + CloudFront에서 제공된다.

5. Alloy 기동 시 Loki 400 Bad Request
   초기 기동 시 오래된 Docker 로그 버퍼를 일괄 전송하면서 발생한다. 14일 이상 된 로그를 Grafana Cloud가 거부하는 정상 동작이며, 현재 시각 로그로 따라잡으면 자동 해소된다.

## 관련 문서

- [`docs/agent/plan/log-monitoring-implementation-plan.md`](../docs/agent/plan/log-monitoring-implementation-plan.md)
- [`docs/engineering-log/모니터링-셀프호스팅-to-그라파나클라우드-전환-로그.md`](../docs/engineering-log/모니터링-셀프호스팅-to-그라파나클라우드-전환-로그.md)
