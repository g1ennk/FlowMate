# FlowMate Backend Implementation Guide (Executable)

## 목적
- 이 문서는 **계획 없이 바로 구현**할 수 있도록 작성된 실행 가이드다.
- 기준 문서:
  - `/Users/glenn/projects/FlowMate/docs/plan/api.md`
  - `/Users/glenn/projects/FlowMate/docs/plan/data.md`
- 프론트 호출 경로와 1:1 정합:
  - `/Users/glenn/projects/FlowMate/frontend/src/api/todos.ts`
  - `/Users/glenn/projects/FlowMate/frontend/src/api/settings.ts`
  - `/Users/glenn/projects/FlowMate/frontend/src/api/reviews.ts`

## 고정 의사결정
- 구현 범위: `Todo + Settings + Session + Review`
- Spring Boot: `4.0.2` 유지
- 기본 패키지: `kr.io.flowmate`
- Lombok 사용
  - Entity: `@Getter`, `@NoArgsConstructor(access = PROTECTED)`만
  - DTO: `@Getter/@Setter`, 필요 시 `@Builder`
- 에러 포맷: `{ error: { code, message, fields } }`
- 인증: `X-Client-Id` = `userId`

## 0) 사전 점검
- 프로젝트 위치: `/Users/glenn/projects/FlowMate`
- 백엔드 위치: `/Users/glenn/projects/FlowMate/backend`
- 현재 브랜치 확인: `git status -sb`

## 0-1) 즉시 실행 명령 모음
```bash
cd /Users/glenn/projects/FlowMate/backend

# Java/Gradle 확인
java -version
./gradlew --version

# 의존성/빌드/테스트
./gradlew dependencies
./gradlew clean build
./gradlew test

# 프로파일별 실행
./gradlew bootRun --args='--spring.profiles.active=local'
./gradlew bootRun --args='--spring.profiles.active=dev'
```

## 0-2) 구현 우선순위 체크리스트
- [ ] Step A. Build/Application/Flyway 기반 정리
- [ ] Step B. Todo API 구현 (`/api/todos*`)
- [ ] Step C. Session/Reset 구현 (`/api/todos/{id}/sessions`, `/api/todos/{id}/reset`)
- [ ] Step D. Settings 구현 (`/api/settings*`)
- [ ] Step E. Review 구현 (`/api/reviews*`)
- [ ] Step F. 공통 에러 처리 + `X-Client-Id` 강제
- [ ] Step G. 통합 테스트 작성/통과
- [ ] Step H. 문서 동기화

## 1) Gradle/Dependency 정리
**파일**: `/Users/glenn/projects/FlowMate/backend/build.gradle`

1. 다음 의존성 기준으로 정리
```
implementation 'org.springframework.boot:spring-boot-starter-web'
implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
implementation 'org.springframework.boot:spring-boot-starter-validation'
implementation 'org.springframework.boot:spring-boot-flyway'
implementation 'org.flywaydb:flyway-core'
implementation 'org.flywaydb:flyway-mysql'
compileOnly 'org.projectlombok:lombok'
annotationProcessor 'org.projectlombok:lombok'
runtimeOnly 'com.h2database:h2'
runtimeOnly 'com.mysql:mysql-connector-j'

testImplementation 'org.springframework.boot:spring-boot-starter-test'
```
2. 테스트 스타터는 `spring-boot-starter-test`만 유지
3. `org.springframework.boot:spring-boot-h2console` 필요 시 유지
4. Spring Boot 4 Jackson 주의:
   - `ObjectMapper`/`JsonNode`는 `tools.jackson.databind.*` 기준
   - `@JsonCreator`/`@JsonValue`는 `com.fasterxml.jackson.annotation.*` 사용

## 2) application 설정
**파일 생성**:
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-local.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-dev.yml`
- `/Users/glenn/projects/FlowMate/backend/src/main/resources/application-prod.yml`

**공통 규칙**
- `ddl-auto=validate`
- `jackson.write-dates-as-timestamps=false`
- CORS 허용: `http://localhost:5173`

## 3) Flyway 마이그레이션
**파일**: `/Users/glenn/projects/FlowMate/backend/src/main/resources/db/migration/V1__init.sql`

- 스키마는 `docs/plan/data.md` 그대로
- 테이블:
  - `todos`
  - `todo_sessions`
  - `user_settings`
  - `reviews`
- 유니크:
  - `uniq_reviews_user_period (user_id, type, period_start)`

## 4) 패키지 구조
```
kr.io.flowmate
  config/
  common/error/
  todo/{domain,dto,repo,service,web}
  session/{domain,dto,repo,service,web}
  settings/{domain,dto,repo,service,web}
  review/{domain,dto,repo,service,web}
```

## 5) Entity 설계
- ID는 UUID 문자열
- `createdAt`, `updatedAt`은 `Instant` + `@PrePersist/@PreUpdate`
- enum은 `@Enumerated(EnumType.STRING)`

### Todo
- `title`, `note`, `date`, `miniDay`, `dayOrder`, `isDone`, `sessionCount`, `sessionFocusSeconds`, `timerMode`

### Session
- `todoId`, `userId`, `sessionFocusSeconds`, `breakSeconds`, `sessionOrder`

### UserSettings
- Pomodoro/Automation/MiniDays 전부 포함

### Review
- `type(daily|weekly|monthly)`, `periodStart`, `periodEnd`, `content`

## 6) Repository
- `TodoRepository`
  - `findAllByUserId`
  - `findAllByUserIdAndDate`
  - `findByIdAndUserId`
- `SessionRepository`
  - `findAllByUserIdAndTodoIdOrderBySessionOrderAsc`
  - `deleteAllByUserIdAndTodoId`
  - `findMaxSessionOrder(userId, todoId)` JPQL
- `UserSettingsRepository`
- `ReviewRepository`
  - `findByUserIdAndTypeAndPeriodStart`
  - `findAllByUserIdAndTypeAndPeriodStartBetween`

## 7) DTO/Validation
- 기준: `/Users/glenn/projects/FlowMate/frontend/src/api/types.ts`
- Todo
  - title 1~200
  - miniDay 0~3
  - date YYYY-MM-DD
- Session
  - focus/break seconds 0~43200
- Settings
  - flowMin/breakMin/longBreakMin 1~90, cycleEvery 1~10
  - miniDays time: `HH:MM`, `24:00` 허용
- Review
  - type enum
  - periodStart/periodEnd 필수

## 8) Service
### TodoService
- list(userId, date?)
- create(userId, dto) → date 기본값 `LocalDate.now()`
- update(userId, id, dto)
- reorder(userId, items)
- delete(userId, id)
- reset(userId, id) → sessionCount=0, sessionFocusSeconds=0, timerMode=null + 세션 삭제

### SessionService
- list(userId, todoId)
- create(userId, todoId, dto)
  - sessionOrder 자동 증가
  - todo 집계 증가

### SettingsService
- getSettings(userId) combined
- getSession/Automation/MiniDays
- updateSession/Automation/MiniDays
- row 없으면 default 생성 후 반환

### ReviewService
- get(type, periodStart)
- list(type, from, to)
- upsert(type, periodStart, periodEnd, content)
- delete(id)

**Review 정규화 규칙**
- daily: periodStart = 입력 날짜
- weekly: periodStart = 해당 주 월요일
- monthly: periodStart = 해당 월 1일

## 9) Controller
- `/api/todos`, `/api/todos/{id}`, `/api/todos/reorder`
- `/api/todos/{id}/sessions`
- `/api/todos/{id}/reset`
- `/api/settings`, `/api/settings/*`
- `/api/reviews` (GET/PUT), `/api/reviews/{id}` (DELETE)

**헤더 필수**
- `X-Client-Id` 누락 시 400

## 10) Error Handling
- `GlobalExceptionHandler`
- 포맷: `{ error: { code, message, fields } }`
- validation → `VALIDATION_ERROR`
- not found → 404

## 11) 테스트
**필수 통합 테스트**
1. Todo 생성 + 날짜 필터 조회
2. Todo reorder
3. Session 생성 → Todo 집계 증가
4. Reset → 집계/모드/세션 초기화
5. Settings combined + 섹션 업데이트
6. Review upsert/get/list/delete
7. `X-Client-Id` 누락 400

## 12) 문서 동기화
- `/Users/glenn/projects/FlowMate/docs/apps/backend.md` 생성 및 범위 명시
- `/Users/glenn/projects/FlowMate/docs/README.md` 링크 정합성 확인

## 13) 단계별 완료 커맨드
```bash
cd /Users/glenn/projects/FlowMate/backend

# A 완료 확인
./gradlew dependencies
./gradlew bootRun --args='--spring.profiles.active=local'

# B~E 완료 확인
./gradlew test --tests '*Todo*'
./gradlew test --tests '*Session*'
./gradlew test --tests '*Settings*'
./gradlew test --tests '*Review*'

# F~H 최종 확인
./gradlew test
./gradlew bootRun --args='--spring.profiles.active=local'
```

## 완료 기준
- 프론트 호출 API 전부 동작
- DB 스키마 1:1 적용
- 통합 테스트 최소 7개 통과
- 에러 포맷이 프론트 파서와 정합
