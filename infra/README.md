# FlowMate Infrastructure

> 상태: current
> 역할: FlowMate 배포/운영 구조 가이드. 애플리케이션 계약 문서는 `docs/plan/*`를 따른다.

FlowMate 프론트엔드는 Docker가 아니라 S3 + CloudFront에서 서빙하고, API는 EC2 + Docker Compose + Host Nginx로 운영한다.

## 아키텍처

- Frontend (Dev/Prod): S3 + CloudFront
- Backend API (Dev/Prod): EC2 + Docker Compose
- Reverse Proxy/TLS: Host Nginx + Certbot (REST + member timer SSE 프록시)
- DB: MySQL
- Metrics: Prometheus + Grafana + Node Exporter

도메인:

- Dev Frontend: `https://dev.flowmate.io.kr`
- Prod Frontend: `https://flowmate.io.kr`
- Dev API: `https://api.dev.flowmate.io.kr`
- Prod API: `https://api.flowmate.io.kr`

## 디렉토리 구조

```txt
infra/
├── dev/
│   ├── docker-compose.yml
│   └── config/
├── prod/
│   ├── docker-compose.yml
│   └── config/
└── README.md
```

## 빠른 시작

### Dev

```bash
cd /Users/glenn/projects/FlowMate/infra/dev
vim .env
docker compose up -d --build
```

확인:

- Backend health: `http://127.0.0.1:8080/actuator/health`
- Grafana: `http://localhost:3000`

### Prod

```bash
cd /Users/glenn/projects/FlowMate/infra/prod
vim .env
docker compose up -d --build
```

확인:

- Backend health: `http://127.0.0.1:8080/actuator/health`

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
sudo cp /Users/glenn/projects/FlowMate/infra/dev/config/nginx/nginx.conf /etc/nginx/sites-available/flowmate-api-dev.conf
sudo ln -sf /etc/nginx/sites-available/flowmate-api-dev.conf /etc/nginx/sites-enabled/flowmate-api-dev.conf
sudo nginx -t
sudo systemctl reload nginx
```

### Prod nginx 적용

```bash
sudo cp /Users/glenn/projects/FlowMate/infra/prod/config/nginx/nginx.conf /etc/nginx/sites-available/flowmate-api-prod.conf
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
| prometheus | 9090 노출 | 내부 | 메트릭 수집 |
| grafana | 3000 노출 | 내부 | 시각화 |
| node-exporter | 9100 노출 | 내부 | 시스템 메트릭 |

## 프론트엔드 배포

프론트엔드는 EC2가 아닌 S3 + CloudFront에서 서빙한다.

### Dev 빌드/배포

```bash
cd /Users/glenn/projects/FlowMate/frontend
pnpm build --mode dev
aws s3 sync dist/ s3://flowmate-dev-frontend --delete
aws cloudfront create-invalidation --distribution-id ELD3D7OCSS5QS --paths "/*"
```

### Prod 빌드/배포

```bash
cd /Users/glenn/projects/FlowMate/frontend
pnpm build --mode prod
aws s3 sync dist/ s3://flowmate-prod-frontend --delete
aws cloudfront create-invalidation --distribution-id <prod-distribution-id> --paths "/*"
```

## 운영 명령어

```bash
cd /Users/glenn/projects/FlowMate/infra/dev && docker compose logs -f backend mysql prometheus grafana
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose logs -f backend mysql prometheus grafana

cd /Users/glenn/projects/FlowMate/infra/dev && docker compose up -d --build
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose up -d --build

cd /Users/glenn/projects/FlowMate/infra/dev && docker compose down
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose down
```

## 보안 체크

- `infra/dev/.env`, `infra/prod/.env`는 커밋 금지
- Prod는 강한 비밀번호 사용
- Prod에서 MySQL/Prometheus/Grafana/Node Exporter 외부 포트 미노출 유지
- Host nginx에서 `/actuator/health` 외 Actuator 차단 유지

## 트러블슈팅

1. `unknown host` DB 에러
   `DB_HOST`가 compose 네트워크 기준 주소인지 확인한다.

2. 인증서 에러
   `DOMAIN_NAME`과 nginx `server_name`이 일치하는지 확인한다.

3. `/api/timer/sse`가 60초 전후에 끊김
   host nginx에 `/api/timer/sse` 전용 `location`, `proxy_buffering off`, 긴 `proxy_read_timeout`이 반영됐는지 확인한다.

4. API는 뜨는데 프론트가 안 뜸
   정상이다. 프론트는 S3 + CloudFront에서 제공된다.

## 관련 문서

- [`/Users/glenn/projects/FlowMate/README.md`](/Users/glenn/projects/FlowMate/README.md)
- [`/Users/glenn/projects/FlowMate/backend/README.md`](/Users/glenn/projects/FlowMate/backend/README.md)
- [`/Users/glenn/projects/FlowMate/frontend/README.md`](/Users/glenn/projects/FlowMate/frontend/README.md)
