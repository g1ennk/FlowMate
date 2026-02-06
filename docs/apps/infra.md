# Infra Guide

## 현재 상태
- `infra/` 디렉터리 및 배포 스크립트는 아직 본격 구성 전
- 현재 기준 운영 방식은 로컬 개발 중심

## 로컬 개발 기준
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8080`
- DB(local): H2 in-memory (`spring.profiles.active=local`)

## 예정 방향
- Dev/Prod는 MySQL + Flyway 기반으로 분리
- 애플리케이션 설정은 Spring profile(`local/dev/prod`)로 관리
- 인프라 코드가 추가되면 본 문서를 배포 절차/롤백/모니터링까지 확장

## 체크리스트(예정)
- 컨테이너 표준화(Dockerfile, compose)
- 환경변수 표준화(.env, secret 주입)
- 로그/메트릭 수집
- 배포 검증 시나리오
