# FlowMate Infrastructure

FlowMate 인프라 운영 가이드입니다. 현재 기준으로 프론트엔드는 Docker가 아니라 S3 + CloudFront에서 서빙합니다.

## 아키텍처

- Frontend (Dev/Prod): S3 + CloudFront
- Backend API (Dev/Prod): EC2 + Docker Compose (backend, mysql, observability)
- Reverse Proxy/TLS: Host Nginx + Certbot (Docker 미사용)
- DB: MySQL (Docker Compose 내부 네트워크)
- Metrics: Prometheus + Grafana + Node Exporter

도메인 규칙:
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
│       ├── nginx/nginx.conf
│       ├── prometheus/prometheus.yml
│       └── grafana/provisioning/datasources/prometheus.yml
├── prod/
│   ├── .env
│   ├── docker-compose.yml
│   └── config/
│       ├── nginx/nginx.conf
│       ├── prometheus/prometheus.yml
│       └── grafana/provisioning/datasources/prometheus.yml
└── README.md
```

## 빠른 시작

### Dev

```bash
cd /Users/glenn/projects/FlowMate/infra/dev
# 실제 값으로 수정
vim .env

docker compose up -d --build
```

확인:
- Backend health (direct): `http://127.0.0.1:8080/actuator/health`
- Grafana (포트 노출 시): `http://localhost:3000`

### Prod

```bash
cd /Users/glenn/projects/FlowMate/infra/prod
# 실제 값으로 수정
vim .env

docker compose up -d --build
```

확인:
- Backend health (direct): `http://127.0.0.1:8080/actuator/health`

## Host Nginx + Certbot 설정

Dev/Prod 공통으로, nginx와 certbot은 호스트에서 직접 관리합니다.

```bash
# nginx 설치 (Ubuntu 예시)
sudo apt-get update
sudo apt-get install -y nginx certbot

# ACME webroot 디렉토리 준비
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
# 최초 발급 (dev/prod 도메인 각각 실행)
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

# 자동 갱신 상태/테스트
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 서비스 구성

| 서비스 | Dev | Prod | 설명 |
|---|---|---|---|
| backend | 내부 | 내부 | Spring Boot API |
| mysql | 내부 | 내부 | 데이터베이스 |
| prometheus | 9090 노출 | 내부 | 메트릭 수집 |
| grafana | 3000 노출 | 내부 | 메트릭 시각화 |
| node-exporter | 9100 노출 | 내부 | 시스템 메트릭 |

## 운영 명령어

```bash
# 로그
cd /Users/glenn/projects/FlowMate/infra/dev && docker compose logs -f backend mysql prometheus grafana
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose logs -f backend mysql prometheus grafana

# 재배포
cd /Users/glenn/projects/FlowMate/infra/dev && docker compose up -d --build
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose up -d --build

# 중지
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
- `DB_HOST`가 네트워크 기준 주소인지 확인 (`mysql` 또는 `host.docker.internal`)

2. 인증서 에러
- `DOMAIN_NAME`과 Nginx `server_name` 일치 여부 확인
- `sudo certbot renew --dry-run`으로 갱신 동작 확인

3. API는 뜨는데 프론트 화면이 안 뜸
- 정상입니다. 프론트는 S3 + CloudFront에서 제공됩니다.

## 관련 문서

- `/Users/glenn/projects/FlowMate/README.md`
- `/Users/glenn/projects/FlowMate/backend/README.md`
- `/Users/glenn/projects/FlowMate/frontend/README.md`
- `/Users/glenn/projects/FlowMate/docs/plan/roadmap.md`
