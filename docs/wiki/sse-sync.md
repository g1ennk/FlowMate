# SSE 멀티디바이스 타이머 동기화: 단방향 push와 version 기반 순서 보장

> 후속 문서: [Redis Pub/Sub으로 SSE 수평 확장하기](redis-sse-pubsub.md), [SSE 연결 유지 실패 해결: Workbox 충돌과 Nginx idle timeout](sse-timeout.md)
>
> 관련 문서: [타이머 상태 저장의 동시성 제어: gap lock deadlock에서 원자적 upsert까지](timer-deadlock.md)

## 요약

- **[문제]** 타이머 상태가 기기 안(localStorage)에만 있어 **같은 계정이어도 기기 간 공유되지 않음**
- **[해결]** 조작은 REST로 저장하고 변경은 DB가 계산한 **순차 version**을 붙여 **SSE**로 보내, 이미 반영된 이벤트는 기기가 무시
- **[결과]** 같은 계정의 모든 기기에 **역전 없이 최신 상태 공유**

## 1. 문제 배경: 기기 간 상태 공유 부재

FlowMate의 타이머는 초기에 Zustand 스토어 + localStorage로만 관리돼, 한 기기 안에서는 새로고침해도 유지됐지만 기기 간에는 상태가 전혀 공유되지 않았다.

```text
Desktop: 25분 뽀모도로 시작 (running)
                ↓ 사용자가 모바일로 전환
Mobile:  타이머 없음 (idle) ❌
```

요구사항은 두 가지였다.

- 한 기기에서 타이머를 변경하면 다른 기기에 즉시 반영될 것
- 이벤트 순서가 역전되어도 최신 상태를 유지할 것

단, 게스트는 동기화 대상에서 제외한다. 게스트 토큰은 기기별로 독립된 정체성을 가지므로, 두 기기가 같은 게스트 계정을 공유할 경로가 없다.

## 2. 대안과 선택: WebSocket vs Polling vs SSE

핵심 판단 기준은 데이터 흐름의 비대칭이었다. 클라이언트 -> 서버는 start/pause/resume/stop과 페이즈 전환처럼 상태가 바뀌는 시점에만 발생하므로 REST PUT으로 충분하지만, 서버 -> 클라이언트는 다른 기기의 변경을
미리 열어둔 채널로 즉시 알려야 하므로 push가 필요하다.

| 방식                | 장점                              | 단점                              | 판단     |
|-------------------|---------------------------------|---------------------------------|--------|
| WebSocket (STOMP) | 완전한 양방향 실시간 채널                  | STOMP 구독과 세션 관리 복잡도      | 과잉     |
| Polling           | 구현 단순, 인프라 변경 없음                | 실시간성 부족, 빈 응답 트래픽 낭비            | 부적합    |
| **SSE + REST**    | HTTP 표준, Spring `SseEmitter` 내장 | 클라이언트 -> 서버 단방향 불가 (REST 병행 필요) | **채택** |

WebSocket은 이 구조에서 쓰지 않을 클라이언트 -> 서버 실시간 채널을 위해 STOMP 구독과 세션 관리를 더해야 했고, Polling은 페이즈 전환 순간 다른 기기에서 몇 초간 이전 상태가 보이는 경험이 부적합했다.
SSE는 HTTP 표준이라 Nginx 설정만으로 동작하고, Spring이 `SseEmitter`를 내장 지원해 추가 라이브러리 없이 구현할 수 있었다.

## 3. 아키텍처

전반적인 아키텍처는 다음과 같다. 단일 인스턴스에서는 SseEmitterRegistry가 사용자별 emitter를 같은 JVM 메모리에서 관리하므로, 타이머 상태 변경 시 해당 사용자의 모든 기기에 이벤트를 broadcast할 수 있다.

```mermaid
sequenceDiagram
    participant D as Desktop Browser
    participant S as Spring Boot (단일 JVM)
    participant R as SseEmitterRegistry
    participant M as Mobile Browser
    D ->> S: GET /api/timer/sse?token=accessToken
    S ->> S: token 검증 (role=member)
    S ->> R: register(userId)
    S -->> D: SSE connected
    M ->> S: GET /api/timer/sse?token=accessToken
    S ->> S: token 검증 (role=member)
    S ->> R: register(userId)
    S -->> M: SSE connected
    D ->> S: PUT /api/timer/state/{todoId}
    S ->> S: timer_states 저장 + version 갱신
    S ->> R: broadcast(userId, timer-state)
    R -->> D: timer-state
    R -->> M: timer-state
```

이 그림은 Redis 도입 전 단일 인스턴스 구조다. 현재는 커밋 후 이벤트를 Redis 채널로 발행하고, 각 인스턴스가 받아 broadcast한다([Redis Pub/Sub 확장](redis-sse-pubsub.md)).

## 4. 구현

타이머 상태는 MySQL을 단일 정본으로 관리한다. 앱 초기화 시 `GET /api/timer/state`로 현재 상태를 가져온다.

### 4.1 스키마

```text
CREATE TABLE timer_states
(
    todo_id    VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id    VARCHAR(36)  NOT NULL,
    state_json TEXT         NULL,
    version    BIGINT       NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    CONSTRAINT fk_timer_states_todo
        FOREIGN KEY (todo_id) REFERENCES todos (id) ON DELETE CASCADE
);
CREATE INDEX idx_timer_states_user ON timer_states (user_id, updated_at DESC);
```

| 컬럼                      | 설계 결정                                                     |
|-------------------------|-----------------------------------------------------------|
| `todo_id` PK            | Todo와 1:1 관계, 별도 합성 ID 불필요                                |
| `user_id`               | 소유 사용자. 복원 조회 조건이자 인덱스 선두 키(broadcast 대상은 요청의 사용자 ID로 정한다) |
| `state_json`            | `NULL`이면 idle, JSON이면 활성 상태                               |
| `version`               | 이벤트 최신성 판단 기준값. 저장할 때마다 DB가 Todo별로 1씩 증가                 |
| `updated_at`            | 애플리케이션이 바인딩한 저장 시각. 24시간 복원 기준, `idx_timer_states_user` 정렬 기준 |
| `idx_timer_states_user` | `user_id, updated_at DESC`. 사용자별 최근 상태 복원 조회용                    |

### 4.2 `version`: Todo별 순차 증가

상태를 저장할 때마다 DB가 같은 Todo의 직전 `version`에 1을 더한다(새 행은 1).

```sql
INSERT INTO timer_states (todo_id, user_id, state_json, version, created_at, updated_at)
VALUES (:todoId, :userId, :stateJson, 1, :now, :now) AS incoming
ON DUPLICATE KEY UPDATE
    state_json = incoming.state_json,
    version    = timer_states.version + 1,
    updated_at = incoming.updated_at
```

최초 저장과 갱신이 한 문장이고, 같은 Todo의 동시 쓰기는 행 락으로 한 줄로 서므로 커밋 순서와 version 순서가 같다. 저장한 트랜잭션 안에서 확정된 version을 다시 읽어 API 응답과 SSE 이벤트에 똑같이 쓴다. 다만 이 순서는 DB가 커밋한 순서이지 사용자가 버튼을 누른 순서는 아니다.

처음에는 비관적 락으로 행을 잠근 뒤 애플리케이션이 `max(현재 시각 ms, 직전 version + 1)`을 계산했다. 이 락이 최초 저장에서 gap lock deadlock을 일으켜 걷어내자, 같은 Todo를 동시에 갱신할 때 version이 겹치거나 역전됐다. 그래서 계산을 DB 한 문장인 원자적 upsert로 옮겼다([타이머 상태 저장의 동시성 제어 6절](timer-deadlock.md#6-후속-검증과-최종-해결)). 전환 전에 만들어진 행은 epoch 밀리초 크기의 옛 version에서 이어서 1씩 오르므로, 열린 탭도 다음 이벤트를 버리지 않는다.

### 4.3 늦게 온 이벤트는 기기가 거른다

version이 순서대로 매겨져도 기기에 도착하는 순서는 뒤집힐 수 있다. 이벤트는 커밋 후 요청마다 따로 발행되고, 받는 쪽 전송도 스레드 풀에서 비동기로 돌기 때문이다. 그래서 최신 여부는 기기가 판정한다.

클라이언트는 `todoId`별로 마지막으로 적용한 version을 `seenVersions`에 보관하고, 그보다 작거나 같은 이벤트는 무시한다.

```
v=100: A pause
v=101: B resume
C의 클라이언트가 B의 resume(v=101)을 먼저 받고 A의 pause(v=100)를 늦게 수신
→ seenVersions[todoId] = 101 > 100 이므로 무시
```

#### self-echo: 발신자 식별 없이 전체 broadcast

`broadcast`는 같은 `userId`의 모든 SSE 연결에 같은 이벤트를 보내므로, `PUT`을 보낸 기기도 자기 이벤트를 다시 받는다(self-echo). 발신자를 빼는 대신 서버 로직을 단순하게 두고 `version` 비교로 거른다. 발신 기기는 PUT 응답의 version을 `seenVersions`에 기록해 두므로, 같은 version으로 돌아온 자기 이벤트는 버려진다. 도착 순서에 따른 예외는 7절에 적었다.

### 4.4 Soft Delete: state_json = NULL

타이머를 정지하면 행을 삭제하지 않고 `state_json`을 `NULL`로 설정한다.

```
v=100: running   state_json = "{...}"
v=101: idle      state_json = NULL    (행 유지)
v=102: running   state_json = "{...}"
```

이유는 **version 연속성**이다. version은 같은 행의 직전 값에 1을 더하므로, 행을 지우면 다시 만들어진 행이 1부터 시작한다. 그러면 이전 version을 기억하는 열린 탭이 새로고침할 때까지 새 이벤트를 버린다. 같은 이유로 "24시간 넘게 갱신이 없는 상태는 복원하지 않는다"는 정책도 행을 지우지 않고 조회 조건(`updated_at >= 지금 - 24시간`)으로만 적용한다. 행은 Todo가 삭제될 때만 함께 삭제된다.

### 4.5 SseEmitterRegistry: 연결 관리와 broadcast

SseEmitterRegistry는 같은 `userId`의 여러 SSE 연결을 추적하고 broadcast를 담당한다.

```java
private final ConcurrentHashMap<String, CopyOnWriteArrayList<ConnectionEntry>> connections;

private record ConnectionEntry(String internalId, SseEmitter emitter, ScheduledFuture<?> heartbeatTask) {
}
```

멀티 연결 등록과 제거가 동시에 발생하므로 `ConcurrentHashMap` + `CopyOnWriteArrayList`로 thread-safe하게 관리한다.

- `userId` 키 아래에 여러 `ConnectionEntry`를 보관 (PC + 모바일 + 다중 탭)
- 각 연결의 `internalId`로 제거 시점 식별

#### 등록과 1시간 timeout

```text
SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS); // 1시간

emitter.onCompletion(() -> removeEntry(userId, internalId));
emitter.onTimeout(() -> removeEntry(userId, internalId));
emitter.onError(e -> removeEntry(userId, internalId));

emitter.send(SseEmitter.event().name("connected").data("ok"));
```

연결 직후 `connected` 이벤트를 1회 전송해 클라이언트가 SSE 진입 성공을 즉시 확인할 수 있게 한다. 정상 완료, timeout, 오류 중 어떤 이유로 끊기든 정리 로직은 동일하므로 세 콜백 모두
`removeEntry`를 호출한다.

#### 25초 heartbeat

각 연결에 `scheduleAtFixedRate`로 25초 간격 heartbeat를 등록한다.

인프라 타임아웃(Nginx `proxy_read_timeout 3600s`, Spring `SseEmitter` 1시간)이 길어도 25초 heartbeat를 두는 이유는 두 가지다.

- **중간망 idle timeout 대응**: 모바일 NAT, 프록시, 방화벽처럼 Nginx 바깥의 장비는 한동안 데이터가 오가지 않는 연결을 끊을 수 있고, 끊는 시간은 장비마다 다르다.
- **죽은 연결 정리**: 보낼 이벤트가 없으면 사라진 클라이언트의 연결도 timeout(1시간)까지 남는다. heartbeat 쓰기가 실패하면 그 시점에 해당 연결과 heartbeat 작업을 정리한다.

재연결은 heartbeat가 아니라 브라우저 `EventSource`의 연결 오류 처리에 맡긴다.

#### broadcast fire-and-forget

`broadcast`는 같은 `userId`의 모든 emitter에 이벤트를 순차 전송하되, 개별 전송 실패 시 해당 연결만 정리하고 예외는 삼킨다. 끊긴 연결의 전송 실패가 나머지 기기 전파를 중단시키지 않도록
격리하기 위해서다. 정본은 MySQL에 이미 저장된 상태이므로, 전파 실패가 데이터 손실로 이어지지는 않는다.

### 4.6 SSE 인증: 쿼리 파라미터 기반 토큰 전달

브라우저 표준 `EventSource` API는 커스텀 `Authorization` 헤더 설정을 지원하지 않는다.

```text
// 불가능
new EventSource('/api/timer/sse', {headers: {'Authorization': 'Bearer ...'}})

// 쿼리 파라미터로 토큰 전달
new EventSource(`/api/timer/sse?token=${encodeURIComponent(token)}`)
```

서버는 쿼리 파라미터로 받은 토큰을 `parseToken` 한 번으로 만료와 서명을 동시 검증하고, `role=member`가 아니면 401로 거절한다.

| 방식                       | 장점                                   | 단점                            | 판단     |
|--------------------------|--------------------------------------|-------------------------------|--------|
| 단기 SSE 티켓 발급             | access token 원문 노출 방지, 노출 시 영향 범위 축소 | 발급 API, 저장소, 만료 정책, 일회성 처리 필요 | 과잉     |
| **쿼리 파라미터 access token** | 별도 인프라 없이 기존 토큰 재사용                  | URL 노출 위험                     | **채택** |

쿼리 파라미터로 access token을 전달하면 요청 URL이 기록되는 곳에 토큰도 남는다. 지금은 Nginx가 SSE 경로에도 기본 액세스 로그를 쓰므로 토큰이 액세스 로그에 기록된다. 대신 HTTPS로 전송 구간을 보호하고 Access Token TTL을 15분으로 짧게 유지해([토큰 정책](auth-evolution.md#토큰-정책)), 노출되더라도 재사용할 수 있는 시간을 제한한다.

## 5. 검증

### 5.1 테스트

구현의 핵심 설계 결정마다 테스트를 작성해 정합성을 확인했다. 동시성은 H2나 mock으로 재현되지 않아 실제 MySQL 8.0(Testcontainers)에서 검증한다.

| 검증 대상              | 테스트                      | 확인 내용                                                         |
|--------------------|--------------------------|---------------------------------------------------------------|
| 저장 동시성, version 연속 | `TimerStateConcurrencyIT` 외 (MySQL) | 같은 Todo 동시 저장 모두 성공, version 겹침과 역전 없음. 상세는 [timer-deadlock 6절](timer-deadlock.md#6-후속-검증과-최종-해결) |
| 응답과 이벤트의 version 일치 | `TimerStateWriteContractIT` | API 응답, DB, 커밋 후 이벤트의 version과 상태가 같음 |
| 기기의 역전 무시 | `timerStore.test.ts` (프론트) | 마지막으로 적용한 version 이하의 상태와 reset, PUT 응답과 같은 version의 자기 이벤트는 버림 |
| soft delete, 24시간 복원 | `TimerStateWriteContractIT`, `TimerStateTimeIT` | idle은 `NULL`로 행 유지, 24시간 경계는 `>=`로 포함                  |
| broadcast 실패 격리    | `SseEmitterRegistryTest` | 전송 실패 시 예외를 호출자에게 전파하지 않음                                     |
| 다중 연결 broadcast    | `SseEmitterRegistryTest` | 같은 userId의 모든 emitter에 이벤트 전달                                 |
| SSE 인증: member 허용  | `TimerControllerTest`    | 유효한 member 토큰이면 `SseEmitterRegistry.register()` 호출            |
| SSE 인증: guest 차단   | `TimerControllerTest`    | `role ≠ member`이면 401                                         |
| SSE 인증: 무효 토큰      | `TimerControllerTest`    | 서명과 만료 검증 실패 시 401                                            |

### 5.2 서버 간 전파와 부하 검증

서버를 2대로 늘렸을 때의 전파와 부하 검증은 [Redis Pub/Sub 위키 5절](redis-sse-pubsub.md#5-검증)에 있다.

## 6. 트레이드오프 요약

| 결정                    | 얻은 것             | 감수한 비용         | 판단                 |
|-----------------------|------------------|----------------|--------------------|
| **SSE + REST**        | 단순 인프라, 내장 지원    | REST 병행 필요     | 단방향 push로 충분       |
| **MySQL 단일 정본**       | 정본 단일화           | 앱을 열 때 서버 조회로 상태 복원 | 기기 간 공유가 목표라 수용 |
| **순차 version (DB 원자적 증가)** | 커밋 순서 = version 순서 | MySQL 전용 네이티브 SQL | 마지막으로 커밋된 쓰기가 남는(LWW, Last-Write-Wins) 구조에 충분 |
| **state_json = NULL** | version 연속성 유지   | idle row 잔존    | 연속성 우선             |
| **25초 heartbeat**     | 중간망 idle timeout 대응과 죽은 연결 정리 | 주기적 트래픽        | 타임아웃만으로 중간망 통제 불가  |
| **fire-and-forget**   | 실패 격리            | 일부 SSE 누락 가능   | 앱을 다시 열 때 상태를 다시 받아 복구(재연결 시 재조회는 미구현) |
| **self-echo**         | 서버 로직 단순화        | 발신자도 자기 이벤트 수신 | version 비교로 처리(예외는 7절)     |
| **query param 토큰**    | 기존 토큰 재사용        | URL 노출 위험      | 짧은 TTL + HTTPS로 수용 |

## 7. 한계

- **SSE가 끊긴 동안의 변경은 자동으로 복구되지 않는다.** `EventSource`가 재연결해도 상태를 다시 조회하지 않으므로, 놓친 변경은 그 Todo에 다음 이벤트가 오거나(이벤트는 전체 상태를 싣는다) 앱을 다시 열 때 맞춰진다.
- **발신 기기는 잠시 이전 상태에 남을 수 있다.** PUT 응답과 자기 이벤트, 다른 기기 이벤트의 도착 순서에 따라 생기며, 그 Todo의 다음 이벤트나 앱을 다시 열 때 맞춰진다.
- **실패한 PUT 재시도는 멱등하지 않다.** 서버는 저장했는데 응답만 못 받았다면 재시도로 version이 한 번 더 오르고, 그사이 들어온 다른 기기의 상태를 덮어쓸 수 있다.

## 8. 회고

### 단방향 push만으로 동기화 요구사항을 충족했다

타이머 동기화에 양방향 채널은 필요하지 않았다. 단방향 push와 REST로 별도 인프라 없이 구현했고, 이벤트 역전은 DB가 매기는 순차 version을 기기가 비교해 걸렀다.

### SSE는 코드 구현만으로 끝나지 않았다

SSE 연결은 Spring의 `SseEmitter`를 활용해 구현하는 것과, 그 연결이 실제 HTTPS 환경에서 유지되는 것은 별개의 문제였다. 서비스워커(Workbox)가 요청을 가로채는 방식, 브라우저 `EventSource`의 재연결 동작, Nginx의 proxy buffering과 timeout 설정, 중간망의 idle 연결 정리처럼 브라우저와 인프라 레벨의 이해가 함께 필요했다. 이 부분에 대한 선행 지식 없이 진행해 dev 환경에서 SSE가 연결되지 않거나 60초 만에 끊기는 문제를 겪었고, 이 경험은 [SSE 연결 유지 실패 해결: Workbox 충돌과 Nginx idle timeout](sse-timeout.md)에 정리했다.

### 단일 인스턴스의 구조적 한계

이 구조에서 `SseEmitterRegistry`는 JVM 메모리에 연결을 보관하므로, 인스턴스가 2대 이상으로 확장되면 다른 인스턴스에 연결된 기기에 이벤트가 도달하지 못하는 한계가 있다. 이 문제는 이후
Redis Pub/Sub을 도입해 해결했으며, 자세한 내용은 [Redis Pub/Sub으로 SSE 수평 확장하기](redis-sse-pubsub.md)에 정리했다.
