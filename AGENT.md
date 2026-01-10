# AGENT Guide

## 목적
- Todo + Pomodoro MVP 작업 시 에이전트가 따라야 할 최소 가이드와 참조 경로를 제공한다.

---

## 📍 현재 상태
**Frontend MVP 완료 ✅** | Backend 작업 준비 단계

---

## 🗺️ 로드맵 (Frontend → Backend → Deploy)

### ✅ 완료된 작업

#### 📋 문서화
- [x] Plan 문서 정리 (PRD/Design/API) — `docs(plan): update plan (prd/design/api)`
- [x] Backend/Frontend 계획 문서 — `docs(backend): update backend plan`, `docs(frontend): add frontend plan`
- [x] AGENT 가이드 — `docs: add AGENT guide`
- [x] 테스트 문서 작성 (35개 케이스) — `docs: 타이머 기능 개선 사항 문서 업데이트`

#### 🎨 1단계: Frontend (완료)
- [x] **기본 설정**
  - [x] 스캐폴딩 (Vite/Router/Query/Zustand/Tailwind) — `feat(frontend): scaffold app shell`
  - [x] MSW 모킹 세팅 (정상/에러) — `chore(frontend): add msw mocks`
  - [x] localStorage 기반 데이터 영속성 구현

- [x] **코어 기능**
  - [x] 타이머 store/로직 (endAt, 단일 활성, 보정) — `feat(frontend): add timer store and completion flow`
  - [x] 페이지 구현 (Todos/Settings/Timer) + 상태/검증 — `feat(frontend): build pages and forms`
  - [x] 캘린더 기반 UI (월간/주간 뷰, 날짜별 Todo 필터링)
  - [x] Todo CRUD + 드래그로 순서 변경 (@dnd-kit)
  - [x] 메모 기능
  - [x] 일별 통계 뱃지 (미완료/완료/세션)

- [x] **타이머 시스템**
  - [x] 뽀모도로 타이머 (Flow → Break 자동 전환)
  - [x] 일반 타이머 (Stopwatch)
  - [x] 타이머 코어 로직 개선 — `feat: 타이머 코어 로직 개선 - API 분리, 세션 네비게이션, 누적 로직`
    - [x] 일반 타이머 전용 API 분리 (시간만 누적)
    - [x] 세션 기반 양방향 네비게이션 (skipToPrev/skipToNext)
    - [x] 리셋 기능
    - [x] Flow 완료 시에만 세션 카운트 증가
    - [x] 자동 완료 감지 및 기록 (autoCompletedTodos Set)
  - [x] 타이머 UI/UX 개선 — `feat: 타이머 UI/UX 전면 개선 - 배경색, 정지 재개, 모드 선택`
    - [x] Phase별 배경색 (Flow: 검정, Break: 에메랄드)
    - [x] 정지 후 pause 상태 유지 및 재개 기능
    - [x] 모드 선택 화면 개선
    - [x] Break 중 완료 버튼 비활성화
  - [x] 타이머 완료 알림음 (Web Audio API)
  - [x] 자동 시작 설정 (autoStartBreak, autoStartSession)
  - [x] 코드 리팩토링 — `refactor: 타이머 로직 분리 및 구조 개선`
    - [x] timerStore.ts 간소화 (767줄 → 500줄)
    - [x] useTimerActions.ts 분리 (액션 핸들러)
    - [x] useTimerInfo.ts 분리 (타이머 정보 계산)
    - [x] timerFormat.ts 생성 (시간 포맷 함수)
    - [x] updateInitialFocusMs 추가 (일반 타이머 기록 동기화)
    - [x] useResetTimer 즉시 캐시 업데이트 (UX 개선)

- [x] **테스트**
  - [x] 타이머 전이/remaining 계산 테스트
  - [x] CRUD 훅 + MSW 통합 테스트
  - [x] 수동 테스트 가이드 작성 (35개 케이스)

---

### 🚧 진행 예정

#### ⚙️ 2단계: Backend (다음 작업)
- [ ] **기본 설정**
  - [ ] 스캐폴딩 (Spring Boot, MySQL/H2, Flyway) — `feat(backend): scaffold api baseline`
  - [ ] Flyway V1 마이그레이션 (todos, pomodoro_settings) — `chore(backend): add flyway V1 init`
  - [ ] CORS 설정, 에러 핸들링

- [ ] **API 구현**
  - [ ] Todo CRUD API — `feat(backend): implement todo api`
    - [ ] GET /api/todos
    - [ ] POST /api/todos
    - [ ] PATCH /api/todos/{id}
    - [ ] DELETE /api/todos/{id}
  - [ ] 타이머 완료 API — `feat(backend): implement timer completion api`
    - [ ] POST /api/todos/{id}/pomodoro/complete (시간+횟수)
    - [ ] POST /api/todos/{id}/focus/add (시간만)
  - [ ] 설정 API — `feat(backend): implement settings api`
    - [ ] GET /api/settings/pomodoro
    - [ ] PUT /api/settings/pomodoro

- [ ] **테스트**
  - [ ] Service/Repository 단위 테스트 — `test(backend): add service tests`
  - [ ] Controller 슬라이스 테스트 — `test(backend): add controller tests`
  - [ ] 통합 테스트 (해피 패스)

#### 🚀 3단계: 배포/운영
- [ ] **빌드/배포**
  - [ ] Frontend 정적 호스팅 설정
  - [ ] Backend Jar 빌드 및 배포
  - [ ] 빌드 파이프라인 구성 — `chore: add build/deploy pipeline`

- [ ] **환경 설정**
  - [ ] 프로필 분리 (dev/prod) — `chore: add env profiles`
  - [ ] 환경 변수 설정 (DB, API URL, USE_MOCK)
  - [ ] MySQL 연결 설정 (prod)
  - [ ] H2 설정 (dev, optional)

- [ ] **운영 준비**
  - [ ] 로그 레벨 설정
  - [ ] 헬스체크 엔드포인트
  - [ ] DB 연결 풀 최적화
  - [ ] 운영 체크리스트 작성 — `chore(ops): add ops checklist`

#### 🎯 4단계: 개선 사항 (백로그)
- [ ] 다크 모드
- [ ] Todo 검색 기능
- [ ] 반복 Todo (Recurring)
- [ ] 통계 및 대시보드
- [ ] 멀티 유저 지원 (JWT 인증)
- [ ] PWA (오프라인 지원)
- [ ] 알림 설정 (브라우저 알림)

---

## 📚 참고 문서

### 핵심 문서
- **PRD**: `docs/plan/prd.md` - 제품 요구사항 정의서
- **Design**: `docs/plan/design.md` - UI/UX 설계
- **API Spec**: `docs/plan/api.md` - API 명세

### 구현 계획
- **Frontend Plan**: `docs/frontend.md` - 프론트엔드 구현 가이드
- **Backend Plan**: `docs/backend.md` - 백엔드 구현 가이드

### 테스트
- **Timer Test**: `docs/test/TIMER_TEST.md` - 타이머 수동 테스트 가이드 (35개 케이스)
- **Test Index**: `docs/test/README.md` - 테스트 문서 인덱스

---

## 📖 API 문서 관리 전략

### 개인/MVP 단계 (현재) ✅
```
api.md (단일 진실 공급원)
   ↓
Frontend: MSW 모킹
Backend: API 구현
```

**현재 방식:**
- `docs/plan/api.md`: 모든 API 명세 문서화
- Frontend: api.md 보고 MSW 핸들러 작성
- Backend: api.md 보고 Controller 구현

---

### 팀 프로젝트 전환 시 🔄

#### Phase 1: 기획 단계 (Backend 개발 전)
```
PM/기획자 + Frontend + Backend
         ↓
    api.md 작성
         ↓
    리뷰 & 합의
```

**api.md 내용 (Why, 개념):**
- API 목적 및 호출 시점
- 비즈니스 규칙 및 제약사항
- 에러 처리 전략
- 기본 Request/Response 구조

**이 단계에서 합의:**
- ✅ 어떤 API가 필요한가?
- ✅ 언제 호출하나?
- ✅ 어떤 데이터를 주고받나?
- ✅ 비즈니스 규칙은?

---

#### Phase 2: 개발 시작 (Backend 구현)

**Backend에 추가:**
```gradle
// build.gradle
dependencies {
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.3.0'
}
```

**자동 생성:**
- Swagger UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

**Controller 예시:**
```java
@RestController
@RequestMapping("/api/todos")
@Tag(name = "Todo", description = "Todo CRUD API")
public class TodoController {
    
    @PostMapping
    @Operation(summary = "할 일 생성", description = "새로운 할 일을 등록합니다")
    public ResponseEntity<Todo> createTodo(
        @Valid @RequestBody TodoCreateRequest request
    ) {
        // 구현...
    }
}
```

---

#### Phase 3: 병행 사용 (역할 분담)

**api.md 역할 (Why, 개념):**
- API 설계 의도 및 목적
- 비즈니스 규칙 상세 설명
- 호출 시점 및 에러 처리
- 팀 합의 및 의사결정 기록

**Swagger UI 역할 (What, 정확한 스펙):**
- 실시간 API 명세 (코드와 100% 동기화)
- 정확한 Request/Response 타입
- "Try it out" 즉시 테스트
- 자동 업데이트 (코드 변경 시)

---

### 팀원별 사용 패턴

#### Frontend 개발자
```
1. 기획: api.md로 API 이해
2. 개발: Swagger UI로 정확한 스펙 확인
3. 테스트: "Try it out"으로 직접 테스트
4. 의문:
   - "왜?" → api.md
   - "정확한 타입?" → Swagger
```

#### Backend 개발자
```
1. 기획: api.md로 요구사항 이해
2. 개발: Controller 구현 + @Operation 추가
3. 공유: Swagger URL을 팀에 공유
4. 문서화: api.md에 비즈니스 로직 추가
```

#### QA/테스터
```
1. 테스트: Swagger "Try it out"
2. 리포트: Swagger 링크 첨부
3. 검증: api.md로 의도 확인
```

#### PM/기획자
```
1. 기획: api.md 작성 및 리뷰
2. 검증: Swagger로 구현 확인
3. 의사결정: "의도대로 구현됐나?"
```

---

### 두 문서의 역할 비교

| 항목          | api.md          | Swagger UI        |
| ------------- | --------------- | ----------------- |
| **작성 시점** | 기획 단계       | 개발 중 (자동)    |
| **작성자**    | PM + 개발자     | Backend (자동)    |
| **내용**      | Why, 개념, 규칙 | What, 정확한 스펙 |
| **업데이트**  | 수동 (필요 시)  | 자동 (실시간)     |
| **사용 시점** | 기획, 리뷰      | 개발, 테스트      |
| **신뢰도**    | 개념 이해용     | 100% 정확 (코드)  |

---

### 고급 기능 (팀 확장 시)

#### 1. OpenAPI JSON Export
```bash
# Backend 실행 후
curl http://localhost:8080/v3/api-docs > openapi.json
git add openapi.json
```

**효과:**
- ✅ Backend 실행 없이 명세 확인
- ✅ Git diff로 API 변경 추적
- ✅ 팀원 즉시 확인 가능

---

#### 2. Frontend 타입 자동 생성
```bash
# openapi-generator
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-axios \
  -o frontend/src/api/generated

# 또는 orval (추천)
npx orval --input openapi.json --output frontend/src/api
```

**효과:**
- ✅ 타입 안정성 100%
- ✅ API 변경 즉시 반영
- ✅ 런타임 에러 방지

---

#### 3. 문서 호스팅 (선택)

**GitHub Pages:**
```yaml
# .github/workflows/docs.yml
- Swagger UI 정적 배포
- openapi.json 자동 업데이트
```
→ `https://yourteam.github.io/todo-flow/api-docs`

**Swagger Hub / Postman:**
- 팀 워크스페이스
- 버전 관리
- Mock Server

---

### 중요 원칙

1. **"전환"이 아니라 "추가 + 역할 분담"**
   - api.md 삭제하지 않음
   - Swagger는 보조 도구
   - 둘 다 유지하며 역할 분담

2. **개인 프로젝트: api.md만으로 충분**
   - Backend 시작할 때 Swagger 추가
   - 추가 설정 최소화

3. **팀 프로젝트: 단계적 확장**
   - 2-3명: + openapi.json (Git)
   - 5명+: + 타입 자동 생성
   - 10명+: + 문서 호스팅

---

## 🛠️ 기술 스택

### Frontend
- **빌드**: Vite + pnpm
- **UI**: React 18 + TypeScript
- **라우팅**: React Router
- **상태 관리**: 
  - TanStack Query (서버 상태)
  - Zustand (클라이언트/타이머 상태)
- **스타일**: Tailwind CSS v4
- **폼**: react-hook-form + Zod
- **DnD**: @dnd-kit
- **알림**: react-hot-toast
- **유틸**: date-fns, clsx
- **모킹**: MSW (Mock Service Worker)
- **테스트**: Vitest + @testing-library/react

### Backend (예정)
- **Framework**: Spring Boot
- **의존성**: Web, Validation, Data JPA, Flyway
- **DB**: MySQL (prod) / H2 (dev)
- **인증**: 없음 (MVP - userId="local")

---

## 📦 데이터 모델

### Todo
```typescript
{
  id: string           // UUID
  title: string        // 1~200자
  note: string | null  // 메모 (선택)
  date: string         // YYYY-MM-DD
  isDone: boolean      // 완료 여부
  pomodoroDone: number // 뽀모도로 세션 횟수
  focusSeconds: number // 총 집중 시간 (초)
  createdAt: string    // ISO 8601
  updatedAt: string    // ISO 8601
}
```

### PomodoroSettings
```typescript
{
  flowMin: number          // 1~180 (기본 25)
  breakMin: number         // 1~60 (기본 5)
  longBreakMin: number     // 1~120 (기본 15)
  cycleEvery: number       // 1~12 (기본 4)
  autoStartBreak: boolean  // 자동 휴식 시작
  autoStartSession: boolean // 자동 세션 시작
}
```

**참고**: `pomodoroTarget`는 사용하지 않음

---

## 🎯 핵심 원칙

### 타이머 관리
- **클라이언트 우선**: 타이머는 클라이언트에서 관리 (`endAt` 기준)
- **서버 역할**: 완료 시 누적 데이터만 기록
- **단일 활성**: 멀티 탭 동시 실행 차단/경고 권장
- **정확도 보정**: `visibilitychange` 시 남은 시간 재계산

### 설정 관리
- **스냅샷 적용**: 타이머 시작 시 현재 설정 저장
- **실행 중 불변**: 실행 중 설정 변경은 다음 타이머부터 반영

### 모킹 전략
- **개발**: MSW로 API 모킹
- **전환**: `VITE_USE_MOCK` 플래그로 실제 API/모킹 전환

### 데이터 영속성
- **개발**: localStorage (MSW 핸들러)
- **프로덕션**: MySQL

---

## 🔌 API 요약

### Todo API
- `GET /api/todos` - 목록 조회
- `POST /api/todos` - 생성
- `PATCH /api/todos/{id}` - 수정 (부분)
- `DELETE /api/todos/{id}` - 삭제

### 타이머 완료 API
- `POST /api/todos/{id}/pomodoro/complete` - 뽀모도로 완료 (시간+횟수)
  - Body: `{ "durationSec": number }`
  - Effect: `pomodoroDone += 1`, `focusSeconds += durationSec`
  
- `POST /api/todos/{id}/focus/add` - 일반 타이머 완료 (시간만)
  - Body: `{ "durationSec": number }`
  - Effect: `focusSeconds += durationSec` (횟수 증가 X)

### 설정 API
- `GET /api/settings/pomodoro` - 조회 (없으면 기본값 생성)
- `PUT /api/settings/pomodoro` - 전체 수정

### 에러 포맷
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "title is required",
    "fields": { "title": "Required" }
  }
}
```

---

## ✅ 검증/유효성

### Todo
- `title`: 1~200자 (필수)
- `note`: 제한 없음 (선택)
- `date`: YYYY-MM-DD 형식

### Settings
- `flowMin`: 1~180
- `breakMin`: 1~60
- `longBreakMin`: 1~120
- `cycleEvery`: 1~12

### Timer
- `durationSec`: 1~10800 (권장 상한 3시간)

---

## 📝 작업 지침

### 일관성 유지
- 변경 전후 관련 문서/코드 일관성 확인
- 데이터 모델, DB 타입, API 스펙 일치 검증

### 타이머 로직 수정 시
- `endAt` 계산 로직 검토
- 설정 스냅샷 적용 확인
- 단일 활성 타이머 보장
- 보정 로직 (`visibilitychange`) 테스트

### Backend 작업 시
- Flyway 마이그레이션: MySQL 기준 (UTF8MB4, InnoDB)
- 에러 처리: 통일된 포맷 준수
- 테스트: Service, Repository, Controller 각 레벨 커버

### Frontend 작업 시
- Query invalidation/rollback 처리 확인
- Zustand 상태 변경 시 sessionStorage 동기화
- Toast/재시도 UX 반영

---

## 🔖 커밋 컨벤션

### 포맷
```
<type>(<scope>): <summary>

[optional body]

[optional footer]
```

### 타입
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅 (동작 변경 없음)
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드/설정 변경

### 스코프
- `frontend`: 프론트엔드
- `backend`: 백엔드
- `plan`: 기획 문서
- `ops`: 운영

### 예시
```bash
feat(frontend): add timer store
feat(backend): implement todo api
docs(plan): update api spec
test(frontend): add timer store tests
chore: add build/deploy pipeline
```

---

## 🧪 테스트 전략

### Frontend
- **단위 테스트**
  - 타이머 상태 전이 (Zustand store)
  - `endAt` 기반 `remainingMs` 계산
  - Phase 전환 로직 (Flow → Break → Long)
  
- **통합 테스트**
  - Todo CRUD 훅 + MSW
  - Settings 훅 + MSW
  - 정상/에러 케이스
  
- **수동 테스트**
  - 35개 테스트 케이스 (docs/test/TIMER_TEST.md)
  - Part 1-4: 핵심 18개
  - Part 5-11: 추가 17개

### Backend (예정)
- **단위 테스트**
  - Service 로직 (Todo CRUD, 완료 누적)
  - Repository (JPA 쿼리)
  
- **통합 테스트**
  - Controller 슬라이스 (@WebMvcTest)
  - 해피 패스: Todos/Settings/Complete
  
- **E2E 테스트** (선택)
  - RestAssured로 전체 플로우

---

## 🚨 주의사항

### 타이머
- `remainingMs`는 항상 `endAt - Date.now()`로 계산 (클라이언트 신뢰)
- 서버는 `durationSec`만 검증 (1~10800초)

### 데이터 일관성
- `focusSeconds`는 일반 타이머 + 뽀모도로 시간 합산
- `pomodoroDone`는 뽀모도로 세션만 카운트

### 멀티 탭
- 현재: 경고 없음 (단일 활성 권장)
- 개선: sessionStorage로 활성 탭 체크

### 보안
- MVP: 인증 없음 (`userId="local"`)
- 프로덕션: JWT 기반 인증 추가 예정

---

## 📞 문의/이슈
- 기획 변경: PRD 먼저 업데이트
- API 변경: API Spec 먼저 업데이트
- 버그 리포트: 재현 단계 + 예상/실제 동작 명시

---

**최종 업데이트**: 2026-01-09  
**현재 단계**: Frontend MVP 완료 → Backend 작업 준비 중 ✅
