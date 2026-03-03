# FlowMate Roadmap

> 상태: current
> 역할: 현재 기준 실행 상태와 남은 작업 정리 문서. 초기 `X-Client-Id` 로드맵은 historical 맥락으로만 본다.

## 요약

FlowMate는 Todo/Session/Settings/Review API, member 타이머 SSE(`connected`/`heartbeat`/`timer-state`) 동기화, JWT 기반 게스트/회원 인증, S3 + CloudFront 프론트 배포, EC2 + Docker Compose API 운영 구조까지 확보했다.  
이 문서는 “무엇이 이미 끝났고, 무엇이 아직 남았는지”를 현재 코드 기준으로 정리한다.

## 현재 상태

### 완료

- Todo / Session / Settings / Review 백엔드 구현
- member 타이머 상태 저장 + SSE(`connected`/`heartbeat`/`timer-state`) 동기화 구현
- guest JWT + 카카오 OAuth 회원 로그인 구현
- Refresh Token cookie + RTR 적용
- Flyway `V1__init.sql`, `V2__add_auth.sql`, `V3__add_timer_state.sql`
- Frontend 주요 화면 구현
- Dev/Prod 배포 구조 정리
- 프론트/백엔드 기본 테스트 세트 구축

### 부분 완료

- 문서 정합화
- 운영 체크리스트 정리
- 테스트 커버리지 확대

### 미구현 / 후속 과제

- OpenAPI / Swagger 자동 문서화
- Controller/Auth/Security 테스트 확장
- 부하 테스트와 성능 리포트

## 단계별 상태

### Phase A — API 기본기

상태: 완료(일부 후속 과제 존재)

- REST 리소스 구조 정리 완료
- 표준 에러 포맷 완료
- Validation + Global Exception 구성 완료
- Health 체크 노출 완료
- OpenAPI/Swagger는 미구현

### Phase B — DB 설계 + JPA 연동

상태: 완료

- ERD 대응 스키마 완료
- Flyway 마이그레이션 완료
- Todo / Timer / Session / Settings / Review JPA 연동 완료

### Phase C — 인증/인가

상태: 완료

- historical: 초기 계획은 `X-Client-Id` 기반 게스트 식별
- current: Bearer JWT 기반 게스트/회원 인증
- `CurrentUserResolver` 기반 사용자 식별 완료
- 카카오 OAuth + Refresh Token Rotation 완료

### Phase D — 배포/운영

상태: 대체로 완료

- Frontend: S3 + CloudFront
- Backend API: EC2 + Docker Compose
- Host Nginx + HTTPS + member timer SSE 전용 location
- Prometheus / Grafana / Node Exporter 구성
- 운영 문서와 실제 구성이 계속 정합화 중

### Phase E — 테스트/리팩토링

상태: 진행 중

- 현재 서비스 레이어 테스트는 존재
- Auth / Security / Controller / Repository 테스트는 추가 여지 큼
- 프론트는 핵심 사용자 흐름 위주 테스트 유지

### Phase F — 성능/확장

상태: 예정

- EXPLAIN 기반 튜닝
- 부하 테스트
- 개선 전/후 수치 문서화

## 현재 체크포인트

- [x] API 스펙과 구현 큰 틀 정합
- [x] miniDay/dayOrder 정렬 보존
- [x] 세션 누적/멱등 처리
- [x] member 타이머 서버 복원 + SSE 반영
- [x] SSE keepalive + host nginx 장기 연결 설정 반영
- [x] docker-compose API stack 존재
- [x] 배포 URL과 운영 문서 존재
- [ ] OpenAPI/Swagger
- [ ] 성능 수치화
- [ ] Auth/Security 테스트 보강

## 다음 우선순위

1. 문서 정합화 유지
2. Auth/Security/Controller 테스트 보강
3. 배포/운영 체크리스트 보강
4. 쿼리 튜닝과 부하 테스트
5. 차별화 확장 검토

## historical 메모

초기 로드맵에는 아래 항목이 포함되어 있었지만, 현재는 historical이다.

- `X-Client-Id` 기반 게스트 식별
- Swagger가 이미 구현돼 있다는 전제
- 인증 이전 단계의 MVP-only 가정

현재 계약은 `docs/plan/api.md`, `docs/plan/data.md`, 각 README를 따른다.
