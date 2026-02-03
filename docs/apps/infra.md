# Infra 

## 1. 환경 구성

### 1) Local (개발/테스트)

- 목표: 개발 속도 + 운영 DB와의 차이 최소화
- 구성
  - FE: pnpm dev
  - BE: IntelliJ 로컬 실행
  - DB: MySQL을 Docker 컨테이너로 운영

### 2) Dev (배포 전 테스트용 서버), Prod

- 목표: Prod 배포 전 최종 검증, 실환경 이슈 사전 차단, 최종 운영
- 구성
  - AWS EC2
  - docker-compose로 Nginx + Spring + MySQL 동시 운영