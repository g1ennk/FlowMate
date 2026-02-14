# Infra Guide

## 목적
FlowMate의 인프라 설계, 배포, 운영 가이드

## 아키텍처 개요

### 배포 환경
- **클라우드**: AWS (EC2 기반)
- **컨테이너**: Docker Compose
- **CI/CD**: GitHub Actions
- **모니터링**: Prometheus + Grafana + Sentry

### 서비스 구성
```
┌─────────────────────────────────────────┐
│            CloudFront (CDN)             │ (Optional)
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      AWS EC2 (Ubuntu 22.04 LTS)         │
│  ┌───────────────────────────────────┐  │
│  │  Docker Compose Stack             │  │
│  │                                   │  │
│  │  ┌────────┐  ┌────────┐          │  │
│  │  │ Nginx  │  │ Front  │          │  │
│  │  │ :80/443│  │ :5173  │          │  │
│  │  └───┬────┘  └────────┘          │  │
│  │      │                            │  │
│  │      │       ┌────────┐          │  │
│  │      └──────►│ Backend│          │  │
│  │              │ :8080  │          │  │
│  │              └───┬────┘          │  │
│  │                  │                │  │
│  │              ┌───▼────┐          │  │
│  │              │ MySQL  │          │  │
│  │              │ :3306  │          │  │
│  │              └────────┘          │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │  Monitoring Stack           │ │  │
│  │  │  - Prometheus :9090         │ │  │
│  │  │  - Grafana :3000            │ │  │
│  │  │  - Node Exporter :9100      │ │  │
│  │  └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 환경별 설정

### Local (개발 환경)
- Frontend: `http://localhost:5173` (Vite dev server)
- Backend: `http://localhost:8080` (Spring Boot)
- DB: MySQL (`spring.profiles.active=local`)
- 로컬 Docker Compose로 MySQL만 실행 가능

### Dev (개발 서버)
- URL: `https://dev.flowmate.io` (예시)
- Profile: `spring.profiles.active=dev`
- Docker Compose 전체 스택
- GitHub Actions로 자동 배포 (develop 브랜치)
- MySQL: 컨테이너 + 볼륨 마운트
- 모니터링: Prometheus + Grafana

### Prod (운영 환경)
- URL: `https://flowmate.io` (예시)
- Profile: `spring.profiles.active=prod`
- Docker Compose 전체 스택
- GitHub Actions로 자동 배포 (main 브랜치)
- MySQL: 컨테이너 + 볼륨 마운트 + 자동 백업
- 모니터링: Prometheus + Grafana + Sentry
- SSL/TLS: Let's Encrypt (Certbot)

## 디렉터리 구조

```
flowmate/
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml          # 전체 스택
│   │   ├── docker-compose.local.yml    # 로컬 개발용 (MySQL만)
│   │   ├── nginx/
│   │   │   ├── nginx.conf
│   │   │   └── ssl/                    # SSL 인증서 (production)
│   │   ├── mysql/
│   │   │   └── my.cnf                  # MySQL 설정
│   │   └── prometheus/
│   │       ├── prometheus.yml
│   │       └── rules/
│   ├── scripts/
│   │   ├── deploy.sh                   # 배포 스크립트
│   │   ├── backup.sh                   # DB 백업 스크립트
│   │   ├── restore.sh                  # DB 복구 스크립트
│   │   └── health-check.sh             # 헬스체크 스크립트
│   └── aws/
│       ├── ec2-setup.sh                # EC2 초기 설정
│       └── security-group.json         # 보안 그룹 설정
├── .github/
│   └── workflows/
│       ├── ci.yml                      # CI (테스트)
│       ├── deploy-dev.yml              # Dev 배포
│       └── deploy-prod.yml             # Prod 배포
└── .env.example                        # 환경변수 템플릿
```

## Docker Compose 서비스

### 1. Nginx (리버스 프록시)
- **포트**: 80, 443
- **역할**:
  - Static 파일 서빙 (Frontend)
  - Backend API 프록시 (`/api/*`)
  - SSL 터미네이션
  - Gzip 압축
  - Rate limiting
- **볼륨**:
  - `./frontend/dist:/usr/share/nginx/html`
  - `./infra/docker/nginx/nginx.conf:/etc/nginx/nginx.conf`
  - `./infra/docker/nginx/ssl:/etc/nginx/ssl` (Prod)

### 2. Frontend (Vite build)
- **포트**: 5173 (내부만)
- **빌드**: `frontend/Dockerfile`
- **환경변수**: `VITE_API_URL`
- **역할**: 정적 파일 생성 (Nginx로 서빙)

### 3. Backend (Spring Boot)
- **포트**: 8080 (내부만)
- **빌드**: `backend/Dockerfile`
- **환경변수**:
  - `SPRING_PROFILES_ACTIVE`
  - `SPRING_DATASOURCE_URL`
  - `SPRING_DATASOURCE_USERNAME`
  - `SPRING_DATASOURCE_PASSWORD`
  - `SENTRY_DSN` (Prod)
- **헬스체크**: `GET /actuator/health`

### 4. MySQL
- **포트**: 3306 (내부만)
- **버전**: 8.0
- **볼륨**: `mysql-data:/var/lib/mysql`
- **백업**: 자동 백업 스크립트 (cron)
- **설정**: `my.cnf` (character set, timezone 등)

### 5. Prometheus (메트릭 수집)
- **포트**: 9090
- **타겟**:
  - Backend (`/actuator/prometheus`)
  - Node Exporter
  - MySQL Exporter (Optional)
- **볼륨**: `prometheus-data:/prometheus`

### 6. Grafana (메트릭 시각화)
- **포트**: 3000
- **데이터소스**: Prometheus
- **대시보드**:
  - Spring Boot 대시보드
  - System 대시보드
- **볼륨**: `grafana-data:/var/lib/grafana`

### 7. Node Exporter (시스템 메트릭)
- **포트**: 9100
- **역할**: CPU, 메모리, 디스크 등 시스템 메트릭 수집

## 배포 프로세스

### GitHub Actions CI/CD

#### 1. CI (테스트)
```yaml
# .github/workflows/ci.yml
# develop, main 브랜치 PR 시 자동 실행
- Frontend: pnpm install, pnpm test
- Backend: ./gradlew test
```

#### 2. Dev 배포
```yaml
# .github/workflows/deploy-dev.yml
# develop 브랜치 push 시 자동 실행
1. 빌드 (Frontend + Backend Docker 이미지)
2. AWS EC2 접속 (SSH)
3. Docker 이미지 pull
4. docker-compose up -d (rolling restart)
5. 헬스체크
6. Slack/Discord 알림 (Optional)
```

#### 3. Prod 배포
```yaml
# .github/workflows/deploy-prod.yml
# main 브랜치 push 시 자동 실행
1. 빌드 (Frontend + Backend Docker 이미지)
2. AWS EC2 접속 (SSH)
3. DB 백업 실행
4. Docker 이미지 pull
5. docker-compose up -d (rolling restart)
6. 헬스체크
7. 롤백 스크립트 준비
8. Slack/Discord 알림
```

### 수동 배포
```bash
# 서버 접속
ssh ubuntu@<EC2_IP>

# 최신 코드 pull
cd /opt/flowmate
git pull origin develop  # or main

# 배포 스크립트 실행
./infra/scripts/deploy.sh dev  # or prod

# 로그 확인
docker-compose logs -f backend
```

## 환경변수 관리

### .env 파일 구조
```bash
# .env.dev, .env.prod
# Git에 포함되지 않음 (.gitignore)

# Application
SPRING_PROFILES_ACTIVE=dev
APP_ENV=dev

# Database
MYSQL_ROOT_PASSWORD=<strong_password>
MYSQL_DATABASE=flowmate
MYSQL_USER=flowmate
MYSQL_PASSWORD=<strong_password>

# Backend
SPRING_DATASOURCE_URL=jdbc:mysql://mysql:3306/flowmate?useSSL=false&serverTimezone=Asia/Seoul
SPRING_DATASOURCE_USERNAME=flowmate
SPRING_DATASOURCE_PASSWORD=<strong_password>

# Frontend
VITE_API_URL=https://dev.flowmate.io/api

# Monitoring
SENTRY_DSN=<sentry_dsn>  # Prod only
GRAFANA_ADMIN_PASSWORD=<strong_password>
```

### GitHub Secrets (Actions)
- `AWS_EC2_SSH_KEY`: EC2 SSH 프라이빗 키
- `AWS_EC2_HOST`: EC2 퍼블릭 IP
- `ENV_FILE_DEV`: `.env.dev` 내용 (base64)
- `ENV_FILE_PROD`: `.env.prod` 내용 (base64)
- `DOCKER_HUB_USERNAME`: (Optional) Docker Hub 사용 시
- `DOCKER_HUB_TOKEN`: (Optional) Docker Hub 사용 시

## 모니터링 & 로깅

### 1. 애플리케이션 로그
```bash
# 실시간 로그 확인
docker-compose logs -f backend
docker-compose logs -f nginx

# 로그 파일 위치
/var/log/flowmate/backend/application.log
/var/log/flowmate/nginx/access.log
/var/log/flowmate/nginx/error.log
```

### 2. 메트릭 (Prometheus + Grafana)
- **Prometheus**: `http://<EC2_IP>:9090`
- **Grafana**: `http://<EC2_IP>:3000`
- **수집 메트릭**:
  - JVM: 힙 메모리, GC, 스레드
  - HTTP: 요청 수, 응답 시간, 에러율
  - DB: 커넥션 풀, 쿼리 시간
  - System: CPU, 메모리, 디스크, 네트워크

### 3. 에러 추적 (Sentry)
- **환경**: Prod only
- **통합**: Spring Boot + React
- **알림**: 에러 발생 시 이메일/Slack

### 4. 알림 (Alerting)
- **Prometheus Alertmanager**: (Optional)
  - High error rate
  - Low disk space
  - High CPU/Memory usage
- **Grafana Alerts**: 대시보드 기반 알림

## 백업 & 복구

### 자동 백업 (Cron)
```bash
# /etc/cron.d/flowmate-backup
# 매일 02:00 AM (KST) DB 백업
0 2 * * * root /opt/flowmate/infra/scripts/backup.sh >> /var/log/flowmate/backup.log 2>&1
```

### 백업 스크립트
```bash
# infra/scripts/backup.sh
# MySQL 덤프 생성 → S3 업로드 (Optional)
docker exec flowmate-mysql mysqldump -u root -p$MYSQL_ROOT_PASSWORD flowmate > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 복구 스크립트
```bash
# infra/scripts/restore.sh
# 백업 파일로부터 복구
docker exec -i flowmate-mysql mysql -u root -p$MYSQL_ROOT_PASSWORD flowmate < backup_20250214.sql
```

## 보안

### 1. 네트워크
- **VPC**: Private subnet for DB
- **Security Group**:
  - 80/443: 전체 오픈 (HTTP/HTTPS)
  - 22: 관리자 IP만 허용 (SSH)
  - 3306, 9090, 3000: 내부 네트워크만

### 2. SSL/TLS
- **인증서**: Let's Encrypt (Certbot)
- **자동 갱신**: Cron으로 90일마다

### 3. 환경변수
- `.env` 파일은 Git 제외
- GitHub Secrets로 관리
- 프로덕션 비밀번호는 강력하게 (20자 이상)

### 4. DB 접근
- MySQL 포트는 외부 노출 금지
- Root 계정 원격 접근 차단
- 애플리케이션 전용 계정 사용

## AWS 리소스

### EC2 인스턴스
- **타입**: t3.medium (2 vCPU, 4GB RAM) - MVP 권장
- **OS**: Ubuntu 22.04 LTS
- **스토리지**: 30GB gp3 (확장 가능)
- **보안 그룹**: 위 보안 섹션 참고

### (Optional) 추가 고려사항
- **RDS**: MySQL을 RDS로 마이그레이션 (운영 부담 감소)
- **S3**: 백업 파일 저장소
- **CloudFront**: CDN (Frontend 성능 향상)
- **Route53**: DNS 관리
- **ALB**: 로드밸런서 (스케일링 시)

## 트러블슈팅

### 헬스체크 실패
```bash
# Backend 헬스체크
curl http://localhost:8080/actuator/health

# 로그 확인
docker-compose logs backend

# 재시작
docker-compose restart backend
```

### DB 연결 실패
```bash
# MySQL 상태 확인
docker-compose ps mysql

# MySQL 로그
docker-compose logs mysql

# 연결 테스트
docker exec -it flowmate-mysql mysql -u flowmate -p
```

### 메모리 부족
```bash
# 메모리 사용량 확인
docker stats

# 불필요한 이미지 삭제
docker system prune -a
```

## 롤백 절차

### 애플리케이션 롤백
```bash
# 이전 Git 커밋으로 롤백
git checkout <previous_commit>
./infra/scripts/deploy.sh prod

# 또는 이전 Docker 이미지로 롤백
docker-compose down
docker-compose up -d --force-recreate
```

### DB 롤백
```bash
# 백업에서 복구
./infra/scripts/restore.sh backup_20250214.sql
```

## 체크리스트

### 초기 구축
- [ ] EC2 인스턴스 생성 및 보안 그룹 설정
- [ ] Docker & Docker Compose 설치
- [ ] Git 저장소 클론
- [ ] `.env` 파일 생성 및 환경변수 설정
- [ ] SSL 인증서 발급 (Let's Encrypt)
- [ ] GitHub Secrets 등록
- [ ] 백업 Cron 설정
- [ ] 모니터링 대시보드 구성

### 배포 전 체크
- [ ] 테스트 통과 (Frontend + Backend)
- [ ] 환경변수 확인
- [ ] DB 마이그레이션 스크립트 검증
- [ ] 헬스체크 엔드포인트 동작 확인
- [ ] 롤백 계획 수립

### 배포 후 체크
- [ ] 헬스체크 성공 확인
- [ ] 주요 기능 스모크 테스트
- [ ] 로그 에러 없는지 확인
- [ ] 메트릭 정상 수집 확인
- [ ] 백업 동작 확인

## 참고 자료
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Spring Boot Actuator](https://docs.spring.io/spring-boot/docs/current/reference/html/actuator.html)
