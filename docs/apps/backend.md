# Backend Guide

## 목적
- FlowMate 백엔드(Spring Boot) 구현/운영 가이드
- API 계약의 단일 소스는 `docs/plan/api.md`
- 데이터 모델의 단일 소스는 `docs/plan/data.md`

## 기술 스택
- Java 21
- Spring Boot 4.0.x
- Spring Data JPA + Flyway
- H2(local), MySQL(dev/prod)

## 실행
```bash
cd backend
./gradlew test
./gradlew bootRun --args='--spring.profiles.active=local'
```

## 프로파일
- `local`: H2 in-memory, `ddl-auto=validate`, Flyway 활성화
- `dev`: MySQL + Flyway
- `prod`: MySQL + Flyway

## 핵심 규칙
- 모든 API는 `X-Client-Id` 헤더를 필수로 사용
- 에러 응답 포맷: `{ error: { code, message, fields } }`
- 타이머 상태(ms)는 프론트 로컬 상태, 세션 기록(초)은 서버 저장

## 패키지 구조
```txt
kr.io.flowmate
  config/
  common/error/
  todo/{domain,dto,repo,service,web}
  session/{domain,dto,repo,service,web}
  settings/{domain,dto,repo,service,web}
  review/{domain,dto,repo,service,web}
```

## 엔드포인트 그룹
- Todo: `/api/todos`, `/api/todos/{id}`, `/api/todos/reorder`
- Session: `/api/todos/{todoId}/sessions`
- Settings: `/api/settings`, `/api/settings/pomodoro-session`, `/api/settings/automation`, `/api/settings/mini-days`
- Review: `/api/reviews`

## 테스트
- 통합 테스트는 `backend/src/test/java/kr/io/flowmate` 하위에서 관리
- 권장 순서
```bash
./gradlew test --tests '*Todo*'
./gradlew test --tests '*Session*'
./gradlew test --tests '*Settings*'
./gradlew test --tests '*Review*'
./gradlew test
```
