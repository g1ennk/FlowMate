# FlowMate Infrastructure

FlowMate 인프라 운영 가이드입니다. 현재 기준으로 프론트엔드는 Docker가 아니라 S3 + CloudFront에서 서빙합니다.

## 아키텍처

- Frontend (Dev/Prod): S3 + CloudFront
- Backend API (Dev/Prod): EC2 + Docker Compose
- Reverse Proxy: Nginx (API 전용)
- DB: MySQL (Docker Compose 내부 네트워크)
- Metrics: Prometheus + Grafana + Node Exporter

도메인 규칙:
- Dev Frontend: `https://dev.flowmate.io`
- Prod Frontend: `https://flowmate.io`
- Dev API: `https://api.dev.flowmate.io`
- Prod API: `https://api.flowmate.io`

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
- API health: `https://api.dev.flowmate.io/actuator/health`
- Nginx health: `https://api.dev.flowmate.io/health`
- Grafana (포트 노출 시): `http://localhost:3000`

### Prod

```bash
cd /Users/glenn/projects/FlowMate/infra/prod
# 실제 값으로 수정
vim .env

# (최초 1회) 인증서 발급
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email ${LETSENCRYPT_EMAIL} \
  --agree-tos \
  -d ${DOMAIN_NAME}

docker compose up -d --build
```

확인:
- API health: `https://api.flowmate.io/actuator/health`
- Nginx health: `https://api.flowmate.io/health`

## 서비스 구성

| 서비스 | Dev | Prod | 설명 |
|---|---|---|---|
| nginx | 80/443 외부 노출 | 80/443 외부 노출 | API reverse proxy + TLS |
| backend | 내부 | 내부 | Spring Boot API |
| mysql | 내부 | 내부 | 데이터베이스 |
| certbot | 실행 | 실행 | 인증서 갱신 |
| prometheus | 9090 노출 | 내부 | 메트릭 수집 |
| grafana | 3000 노출 | 내부 | 메트릭 시각화 |
| node-exporter | 9100 노출 | 내부 | 시스템 메트릭 |

## 운영 명령어

```bash
# 로그
cd /Users/glenn/projects/FlowMate/infra/dev && docker compose logs -f
cd /Users/glenn/projects/FlowMate/infra/prod && docker compose logs -f

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
- Nginx에서 `/actuator/health` 외 Actuator 차단 유지

## 트러블슈팅

1. `unknown host` DB 에러
- `DB_HOST`가 네트워크 기준 주소인지 확인 (`mysql` 또는 `host.docker.internal`)

2. 인증서 에러
- `DOMAIN_NAME`과 Nginx `server_name` 일치 여부 확인
- certbot 발급 로그 확인

3. API는 뜨는데 프론트 화면이 안 뜸
- 정상입니다. 프론트는 S3 + CloudFront에서 제공됩니다.

## 관련 문서

- `/Users/glenn/projects/FlowMate/README.md`
- `/Users/glenn/projects/FlowMate/backend/README.md`
- `/Users/glenn/projects/FlowMate/frontend/README.md`
- `/Users/glenn/projects/FlowMate/docs/plan/roadmap.md`
