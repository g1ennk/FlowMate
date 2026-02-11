# FlowMate Roadmap (Backend, Project Based)

> 기준 문서: “2026 백엔드 취업 준비 로드맵(통합본)”  
> 목표: FlowMate를 **개발 → 배포 → 운영 → 개선**까지 완주하고, **문서 + 수치**로 증명한다.

---

## 1) 최종 산출물 (FlowMate 버전)

### 1-1. 메인 백엔드 서비스 (필수)
- REST API + DB(MySQL) + 게스트 식별(`X-Client-Id`)
- 표준 에러 응답 `{error:{code,message,fields}}`
- 배포(HTTPS + Nginx/Proxy)
- 운영 흔적(로그/모니터링/알림 중 1개)

### 1-2. 개선 이력 (필수)
- 성능 개선 1~2개(쿼리 튜닝/인덱스/캐시 중 택)
- 부하 테스트 결과(Throughput/Latency/Error Rate)

### 1-3. 문서 세트 (필수)
- README: 문제 → 행동 → 결과
- ERD + 인덱스 설계 근거
- API 명세 + 에러 포맷 + 주요 시나리오
- 배포/운영 문서 + 트러블슈팅 로그

### 1-4. 차별화 확장 (선택 1)
- Elasticsearch(추천) 또는 Kafka / Kubernetes / MSA
- 선택 이유 + 트레이드오프 문서화

---

## 2) FlowMate 핵심 책임 영역 매핑

- **API**: `docs/plan/api.md`와 1:1 정합
- **데이터**: `todos`, `user_settings`, `todo_sessions`(Session 기록)
- **인증/인가**: MVP는 게스트(`X-Client-Id`), 후속 소셜 로그인
- **성능**: 날짜별/정렬 쿼리 인덱스 최적화
- **안정성**: 에러 포맷/Validation 표준화
- **운영**: docker-compose + HTTPS 배포

---

## 3) 실행 로드맵 (FlowMate 매핑)

### Phase A — API 기본기
**목표**: DB 없이도 API 규칙/에러 포맷을 확정  
**상세 작업**
- REST 리소스/상태코드 규칙 정리 (`/api/*`)
- 표준 에러 포맷 `{error:{code,message,fields}}` 고정
- Validation(Bean Validation) + Global Exception 구성
- DTO 분리(요청/응답) + Jackson 설정
- OpenAPI 자동 문서화(Swagger UI)
- CORS 정책(dev/prod) + 기본 로깅
- Health 체크(`/actuator/health`) 노출
**산출물**
- OpenAPI UI 확인
- 에러 포맷 예시 문서
**완료 기준**
- 잘못된 요청 시 에러 포맷 1:1 일치
- Swagger에 모든 MVP 엔드포인트 노출

### Phase B — DB 설계 + JPA 연동
**목표**: 서비스 형태 완성(스키마/ORM/CRUD)  
**상세 작업**
- ERD 정의(entities + 관계 + 인덱스 근거)
- Flyway V1 마이그레이션 작성
  - 테이블 상세 스키마는 `docs/plan/data.md` 참고
- 인덱스 설계
  - `todos(user_id, date, mini_day, day_order, created_at)`
- JPA 엔티티/리포지토리 구현
- Todo/Settings CRUD 구현 (Service 계층)
**산출물**
- ERD 이미지
- `db/migration/V1__init.sql`
- CRUD 동작 확인 로그
**완료 기준**
- 로컬 MySQL/H2에서 마이그레이션 재현 가능
- CRUD API가 실제 DB를 읽고/쓴다

### Phase C — 인증/인가 베이스라인
**목표**: 사용자 식별 기준 확정 + 향후 확장 대비  
**상세 작업**
- `X-Client-Id` 필수 헤더 처리 (누락 시 400)
- Request Filter에서 userId 추출/전파
- 모든 쿼리에서 user_id 조건 강제
- “게스트 → 소셜 로그인” 전환 정책 문서화
**산출물**
- 게스트 식별 정책 문서
- 필터/미들웨어 코드
**완료 기준**
- 다른 clientId 데이터가 섞이지 않음
- API 호출 시 userId가 항상 강제됨

### Phase D — 배포/운영 최소 구성
**목표**: 실사용 URL + 최소 운영 루틴 확보  
**상세 작업**
- docker-compose(api + mysql) 작성
- 환경 변수 분리 (`.env`, dev/prod 프로파일)
- Nginx Reverse Proxy + HTTPS 구성
- 로그 보존/로테이션 기본 설정
**산출물**
- 배포 문서
- 운영 체크리스트(장애 대응 포함)
**완료 기준**
- docker-compose로 로컬 재현 가능
- HTTPS URL로 접근 가능

### Phase E — 테스트/리팩토링
**목표**: 핵심 규칙 회귀 방지  
**상세 작업**
- Service 단위 테스트
  - reorder/dayOrder 정렬 유지
  - Session 생성 시 누적 로직 + reset 초기화
- Controller 통합 테스트
  - Validation 에러 포맷
  - user_id 격리 확인
- 리팩토링: 중복 제거/레이어 책임 분리
**산출물**
- 핵심 규칙 테스트 세트
- 테스트 결과 기록
**완료 기준**
- 핵심 경로 테스트 안정 통과

### Phase F — 성능/확장
**목표**: 개선을 수치로 증명  
**상세 작업**
- EXPLAIN 기반 쿼리/인덱스 튜닝
- 설정/목록 조회 캐시(선택)
- 부하 테스트(k6 등)로 전/후 비교
**산출물**
- 성능 개선 리포트(전/후 수치)
- 부하 테스트 스크립트
**완료 기준**
- 지표(Throughput/Latency/Error Rate) 개선 기록

---

## 4) FlowMate 전용 체크포인트

- [ ] API 스펙과 코드 1:1 정합
- [ ] miniDay/dayOrder 정렬 보존
- [ ] 타이머 누적/리셋 동작
- [ ] OpenAPI/ERD/Flyway 포함
- [ ] docker-compose 로컬 실행
- [ ] 배포 URL + 운영 문서

---

## 5) 권장 차별화 확장 (FlowMate 적합도)

### 옵션 A) Elasticsearch (추천)
- Todo/세션 통합 검색 + 자동완성
- 동기화/재시도 전략 문서화

### 옵션 B) Kafka
- 이벤트 기반 세션 기록/통계 파이프라인

### 옵션 C) Kubernetes
- Ingress/Service/Deployment 기반 운영 기록

### 옵션 D) MSA
- 최소 2서비스 분리 + 트레이드오프 정리
