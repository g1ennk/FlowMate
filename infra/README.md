# FlowMate Infrastructure

FlowMate 프로젝트의 전체 인프라 구성 및 배포 가이드입니다.

---

## 📂 디렉토리 구조

```
infra/
├── dev/                        # 개발 환경
│   ├── docker-compose.yml      # Dev 전체 스택
│   ├── .env.example            # Dev 환경 변수 템플릿
│   ├── .env                    # Dev 실제 환경 변수 (git ignore)
│   ├── config/
│   │   ├── nginx/
│   │   │   └── nginx.conf      # Dev Nginx 설정
│   │   ├── prometheus/
│   │   │   └── prometheus.yml  # Dev Prometheus 설정
│   │   └── grafana/
│   │       └── provisioning/
│   │           └── datasources/
│   │               └── prometheus.yml  # Grafana Datasource 자동 프로비저닝
│   └── README.md               # Dev 환경 가이드
├── prod/                       # 프로덕션 환경
│   ├── docker-compose.yml      # Prod 전체 스택
│   ├── .env.example            # Prod 환경 변수 템플릿
│   ├── .env                    # Prod 실제 환경 변수 (git ignore)
│   ├── config/
│   │   ├── nginx/
│   │   │   └── nginx.conf      # Prod Nginx 설정 (HTTPS, 보안)
│   │   ├── prometheus/
│   │   │   └── prometheus.yml  # Prod Prometheus 설정
│   │   └── grafana/
│   │       └── provisioning/
│   │           └── datasources/
│   │               └── prometheus.yml  # Grafana Datasource 자동 프로비저닝
│   └── README.md               # Prod 환경 가이드
├── shared/                     # 공통 리소스
│   ├── scripts/                # 배포/백업 스크립트
│   ├── certbot/                # Let's Encrypt SSL 인증서
│   └── backups/                # MySQL 백업
└── README.md                   # 이 파일
```

---

## 🏗️ 아키텍처

### Dev Environment
```
┌─────────────────────────────────────────┐
│  Docker Compose (infra/dev/)            │
├─────────────────────────────────────────┤
│  Nginx (80) ──┐                         │
│               ├─> Frontend (SPA)        │
│               └─> Backend (8080)        │
│                                          │
│  MySQL (3306) <── Backend               │
│                                          │
│  Prometheus (9090) ──> Backend Metrics  │
│  Grafana (3000) ──> Prometheus          │
│  Node Exporter (9100) ──> System Metrics│
└─────────────────────────────────────────┘
```

### Prod Environment
```
┌─────────────────────────────────────────┐
│  Docker Compose (infra/prod/)           │
├─────────────────────────────────────────┤
│  Nginx (80/443) ──┐ [HTTPS + 보안 헤더]│
│                   ├─> Frontend (SPA)    │
│                   └─> Backend (8080)    │
│                                          │
│  MySQL (내부) <── Backend               │
│  Certbot ──> Let's Encrypt SSL 갱신    │
│                                          │
│  Prometheus (내부) ──> Backend Metrics  │
│  Grafana (내부) ──> Prometheus          │
│  Node Exporter (내부) ──> System Metrics│
└─────────────────────────────────────────┘
```

---

## 🚀 빠른 시작

### Dev 환경 실행

```bash
# 1. 환경 변수 설정
cd infra/dev
cp .env.example .env

# 2. 실행
docker compose up -d

# 3. 접속
# Frontend: http://localhost
# Backend API: http://localhost/api
# Grafana: http://localhost:3000 (admin/admin)
```

### Prod 환경 배포

```bash
# 1. 환경 변수 설정 (⚠️ 비밀번호 변경 필수!)
cd infra/prod
cp .env.example .env
vim .env  # 비밀번호, 도메인 변경

# 2. SSL 인증서 발급 (최초 1회)
docker compose run --rm certbot certonly --webroot \
  --webroot-path=/var/www/certbot \
  --email ${LETSENCRYPT_EMAIL} \
  --agree-tos \
  -d ${DOMAIN_NAME}

# 3. 실행
docker compose up -d

# 4. 접속
# Frontend: https://flowmate.yourdomain.com
# Backend API: https://flowmate.yourdomain.com/api
```

자세한 내용은 각 환경별 README를 참고하세요:
- [Dev 환경 가이드](./dev/README.md)
- [Prod 환경 가이드](./prod/README.md)

---

## 🔧 서비스 구성

| 서비스 | Dev 포트 | Prod 포트 | 설명 |
|--------|----------|-----------|------|
| Nginx | 80 | 80, 443 | Frontend + Reverse Proxy |
| Backend | (내부) | (내부) | Spring Boot API |
| MySQL | 3306 | (내부) | 데이터베이스 |
| Prometheus | 9090 | (내부) | 메트릭 수집 |
| Grafana | 3000 | (내부) | 메트릭 시각화 |
| Node Exporter | 9100 | (내부) | 시스템 메트릭 |
| Certbot | - | (자동 갱신) | SSL 인증서 |

**Dev**: 모든 서비스 포트 노출 (로컬 개발 편의)
**Prod**: Nginx만 외부 노출 (보안 강화)

---

## 📋 공통 작업

### 로그 확인

```bash
# Dev
cd infra/dev && docker compose logs -f

# Prod
cd infra/prod && docker compose logs -f backend nginx
```

### 재배포

```bash
# 1. Git pull
git pull origin main

# 2. 환경별 재빌드
cd infra/dev  # 또는 infra/prod
docker compose up -d --build backend
docker compose up --build frontend-builder
docker compose restart nginx
```

### 백업 (Prod)

```bash
cd infra/prod

# MySQL 덤프
docker compose exec mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} flowmate > ../../shared/backups/backup-$(date +%Y%m%d).sql

# 볼륨 백업
docker run --rm -v flowmate_mysql-data-prod:/data -v $(pwd)/../../shared/backups:/backup \
  alpine tar czf /backup/mysql-data-$(date +%Y%m%d).tar.gz -C /data .
```

### 환경 전환

```bash
# Dev → Prod
cd infra/dev && docker compose down
cd ../prod && docker compose up -d

# Prod → Dev
cd infra/prod && docker compose down
cd ../dev && docker compose up -d
```

---

## 🔐 보안 체크리스트

### Dev 환경
- [x] 로컬에서만 접근 가능
- [x] 개발용 약한 비밀번호 사용 가능
- [x] 모든 포트 노출 (디버깅 편의)

### Prod 환경
- [ ] `.env` 파일의 모든 비밀번호를 강력하게 변경
- [ ] `.env` 파일이 Git에 커밋되지 않는지 확인
- [ ] CORS_ORIGINS에 프로덕션 도메인만 포함
- [ ] SSL 인증서 정상 발급 및 자동 갱신 설정
- [ ] Actuator 엔드포인트가 `/actuator/health`만 노출
- [ ] Nginx 보안 헤더 (HSTS, X-Frame-Options 등) 활성화
- [ ] MySQL, Prometheus, Grafana 외부 포트 노출 안 함

---

## 🆘 트러블슈팅

### 일반적인 문제

1. **포트 충돌**
   - 증상: `bind: address already in use`
   - 해결: `.env` 파일에서 포트 변경 또는 기존 프로세스 종료

2. **Backend MySQL 연결 실패**
   - 증상: `Unable to connect to database`
   - 해결: MySQL health check 확인, 환경 변수 비밀번호 일치 확인

3. **Prometheus 타겟 down (`spring-backend`)**
   - 증상: `http://localhost:9090/targets` 에서 spring-backend가 down
   - 원인: `micrometer-registry-prometheus` 의존성 누락 또는 actuator 미노출
   - 해결: `curl http://localhost/actuator/prometheus` 확인 → 404면 Backend 재빌드

4. **Grafana Datasource 없음**
   - 증상: Grafana 대시보드에서 데이터 조회 불가
   - 원인: `config/grafana/provisioning/` 볼륨 마운트 누락
   - 해결: `docker compose up -d grafana` 재시작

5. **Frontend 빌드 실패**
   - 증상: `frontend-builder exited with code 1`
   - 해결: `docker compose logs frontend-builder` 확인

6. **SSL 인증서 오류 (Prod)**
   - 증상: `ERR_SSL_PROTOCOL_ERROR`
   - 해결: Certbot 로그 확인, 수동 갱신 실행

자세한 트러블슈팅은 각 환경별 README 참고.

---

## 📚 참고 문서

- [Backend README](../backend/README.md): Spring Boot 프로파일 설정
- [Frontend README](../frontend/README.md): React 빌드 및 환경 변수
- [인프라 플랜](../docs/agent/plan/infra-plan.md): 전체 인프라 계획
- [배포 가이드](../docs/agent/guide/hands-on-deployment-guide.md): 단계별 배포 가이드

---

## 🤝 기여

인프라 개선 사항이 있다면:
1. Feature 브랜치 생성
2. `infra/dev`에서 먼저 테스트
3. 문제 없으면 `infra/prod`에 적용
4. PR 생성

---

## 📝 라이선스

MIT License - 자유롭게 사용 가능합니다.
