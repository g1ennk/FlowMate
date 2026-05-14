# 멀티디바이스 타이머 동기화: SSE + 단조 증가 `version`

## 요약

- 문제: 기기를 바꾸거나 새 탭을 열면 진행 중인 타이머가 사라짐 — 같은 계정이어도 기기·탭 간 상태 공유가 없었음
- 선택 기준: WebSocket은 과잉, Polling은 실시간성 부족 — 단방향 push 요구에 SSE + REST 채택
- 결과: 타이머 조작이 연결된 모든 기기에 즉시 반영되며, 재접속 후에도 최신 상태 유지 — k6 163,205 req · 에러율 0%

## 1. 문제 배경

FlowMate의 타이머는 초기에 Zustand 스토어 + localStorage로만 관리됐다. 한 기기 안에서는 새로고침해도 타이머가 유지됐지만, 기기 간에는 상태가 전혀 공유되지 않았다.

예를 들어, 데스크탑에서 25분 포모도로를 시작하고 모바일로 전환하면 모바일에는 타이머가 없다.

요구사항은 두 가지였다.

- 한 기기에서 타이머 상태를 변경하면 다른 기기에 즉시 반영
- 이벤트 순서가 역전되어도 올바른 최신 상태 유지

게스트 사용자는 동기화 대상에서 제외한다. 게스트 식별자는 localStorage UUID로 기기별 발급되므로 두 기기가 같은 게스트 정체성을 공유할 경로가 없어, 동기화 대상 자체가 존재하지 않는다.

## 2. 기술 선택: WebSocket vs Polling vs SSE

타이머 동기화의 데이터 흐름은 비대칭이다.

- 클라이언트 → 서버: 사용자가 start / pause / resume / stop을 누를 때만 발생 (REST PUT으로 충분)
- 서버 → 클라이언트: 다른 기기의 변경을 즉시 알려야 함 (push 필요)

이 비대칭성을 기준으로 세 후보를 비교했다.

| 방식                | 장점                              | 단점                             | 판단     |
|-------------------|---------------------------------|--------------------------------|--------|
| WebSocket (STOMP) | 완전한 양방향 실시간 채널                  | 메시지 브로커 인프라, 세션·구독 관리 복잡도      | 과잉     |
| Polling           | 구현 단순, 인프라 변경 없음                | 실시간성 부족, 빈 응답 트래픽 낭비           | 부적합    |
| **SSE + REST**    | HTTP 표준, Spring `SseEmitter` 내장 | 클라이언트 → 서버 단방향 불가 (REST 병행 필요) | **채택** |

WebSocket은 양방향 채널이 강력하지만, 타이머 동기화에는 단방향 push면 충분하다. STOMP 브로커 인프라까지 따라오는 복잡도는 현재 요구사항에 비해 과잉이었다.

Polling은 인프라가 가장 단순하지만 실시간성을 포기해야 한다. 사용자가 휴식 페이즈로 전환한 순간 다른 기기에서 몇 초간 이전 상태가 보이는 경험은 부적합했다.

SSE는 서버 → 클라이언트 단방향 push에 정확히 맞는다. HTTP 표준이라 별도 인프라 없이 Nginx 설정만으로 동작하고, Spring이 `SseEmitter`를 내장 지원해 추가 라이브러리 없이 구현할 수 있다.

## 3. 서버 설계

타이머 상태는 DB를 단일 정본으로 관리한다. 앱 초기화 시 `GET /api/timer/state`로 현재 상태를 가져온다.

### 3.1 스키마

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

| 컬럼                      | 설계 결정                                         |
|-------------------------|-----------------------------------------------|
| `todo_id` PK            | Todo와 1:1 관계, 별도 합성 ID 불필요                    |
| `user_id`               | broadcast 대상 조회 + 인덱스 키                       |
| `state_json`            | `NULL`이면 idle, JSON이면 활성 상태                   |
| `version`               | 이벤트 최신성 판단 기준값, 변경 시마다 단조 증가                  |
| `idx_timer_states_user` | `user_id, updated_at DESC` — 사용자별 최근 상태 조회 커버 |

### 3.2 `version` 단조 증가 방식

상태마다 단조 증가하는 정수 `version`을 부여하고, 클라이언트는 마지막으로 적용한 version보다 작은 이벤트를 무시한다.

```text
long newVersion = Math.max(System.currentTimeMillis(), lastVersion + 1);
```

세 가지 경우를 모두 처리한다.

- `System.currentTimeMillis()`만 쓰면: NTP 보정 등으로 시계가 뒤로 가면 단조성이 깨진다
- `lastVersion + 1`만 쓰면: 시간 기반 추적이 불가능해져 디버깅과 감사 로그에서 순서 파악이 어렵다
- `max(now, lastVersion + 1)`: 두 경우 모두 단조성을 보장하면서 실제 시간과 큰 차이가 나지 않게 유지

`version`은 늦게 도착한 이벤트를 걸러내는 필터다. 서버는 연결이 끊긴 사이의 이벤트를 다시 보내지 않는다 — 오래된 이벤트가 최신 상태를 덮어쓰지 못하게 막는 역할만 한다.

클라이언트는 `todoId`별로 마지막으로 적용한 version을 Map에 보관한다.

```
v=100: A pause
v=101: B resume
A의 클라이언트가 늦게 도착한 자신의 pause(v=100)를 수신
→ seenVersion[todoId] = 101 > 100 이므로 무시
```

### 3.3 Soft Delete: state_json = NULL

타이머를 정지하면 행을 삭제하지 않고 `state_json`을 `NULL`로 설정한다.

```
v=100: running   state_json = "{...}"
v=101: idle      state_json = NULL    (행 유지)
v=102: running   state_json = "{...}"
```

이유는 **version 연속성**이다. 만약 idle 시점에 행을 삭제하면 v=102에서 새 행이 생기고, 다른 기기는 v=101(삭제됨)과 v=102(새로 생긴) 사이의 관계를 판단할 수 없다. `NULL`로
유지하면 같은 row의 version이 단조 증가하므로 모든 기기가 정확히 최신 상태를 판별할 수 있다.

## 4. SseEmitterRegistry: 연결 관리와 Broadcast

SseEmitterRegistry는 같은 `userId`의 여러 SSE 연결을 추적하고 broadcast를 담당한다.

```text
private final ConcurrentHashMap<String, CopyOnWriteArrayList<ConnectionEntry>> connections;

private record ConnectionEntry(String internalId, SseEmitter emitter, ScheduledFuture<?> heartbeatTask) {
}
```

멀티 연결 등록·제거가 동시에 발생하므로 `ConcurrentHashMap` + `CopyOnWriteArrayList`로 thread-safe하게 관리한다.

- `userId` 키 아래에 여러 `ConnectionEntry`를 보관 (PC + 모바일 + 다중 탭)
- 각 연결의 `internalId`로 제거 시점 식별

### 4.1 등록과 1시간 timeout

```text
SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS); // 1시간

emitter.onCompletion(() -> removeEntry(userId, internalId));
emitter.onTimeout(() -> removeEntry(userId, internalId));
emitter.onError(e -> removeEntry(userId, internalId));

emitter.send(SseEmitter.event().name("connected").data("ok"));
```

연결 직후 `connected` 이벤트를 1회 전송해 클라이언트가 SSE 진입 성공을 즉시 확인할 수 있게 한다. 정상 완료·timeout·오류 중 어떤 이유로 끊기든 정리 로직은 동일하므로 세 콜백 모두
`removeEntry`를 호출한다.

### 4.2 25초 heartbeat

```text
ScheduledFuture<?> heartbeatTask = heartbeatExecutor.scheduleAtFixedRate(
        () -> sendHeartbeat(userId, internalId),
        25, 25, TimeUnit.SECONDS
);
```

인프라 타임아웃(Nginx `proxy_read_timeout 3600s`, Spring `SseEmitter` 1시간)이 길어도 25초 heartbeat가 필요한 이유는 세 가지다.

- **중간망 idle timeout 대응**: 모바일 캐리어 NAT, 기업 프록시, ISP 방화벽 등은 idle 연결을 30초~수 분 안에 자체적으로 끊을 수 있다. 서버 타임아웃이 길어도 중간 구간에서 끊기면
  의미가 없다.
- **죽은 연결 감지**: 클라이언트가 비정상 종료되면 서버는 다음 broadcast 전까지 이를 알 수 없다. heartbeat write 실패를 통해 죽은 연결을 빠르게 정리할 수 있다.
- **빠른 재연결 유도**: 네트워크 장애 시 25초 이내에 브라우저 `EventSource.onerror`가 발동되어 클라이언트가 재연결을 시도할 수 있다.

### 4.3 broadcast fire-and-forget

```text
public void broadcast(String userId, SseEmitter.SseEventBuilder event) {
    CopyOnWriteArrayList<ConnectionEntry> entries = connections.get(userId);
    if (entries == null) return;

    for (ConnectionEntry entry : entries) {
        try {
            entry.emitter().send(event);
        } catch (Exception e) {
            log.warn("SSE 브로드캐스트 전송 실패, 연결 정리. userId={}", userId, e);
            removeEntry(userId, entry.internalId());
        }
    }
}
```

전송 실패 예외를 호출자에게 던지지 않는 이유는 **DB 트랜잭션 보호**다. `broadcast`는 `TimerService.upsertState`의 트랜잭션 안에서 DB 저장 직후 호출된다. 예외가 전파되면
트랜잭션이 롤백되어 한 기기의 연결 단절 때문에 다른 모든 기기에 반영되어야 할 상태 변경이 사라진다. 따라서 broadcast는 dead connection만 정리하고 예외는 삼킨다.

### 4.4 발신자 식별 없이 전체 broadcast

`broadcast`는 같은 `userId`의 모든 SSE 연결에 동일한 이벤트를 전송한다. 따라서 `PUT`을 일으킨 발신자 기기도 자기 이벤트를 다시 수신한다.

발신자만 제외하려면 SSE 등록 시 클라이언트별 고유 `connectionId`를 발급하고, 이후 `PUT` 요청에 해당 ID를 포함시켜야 한다. 서버는 `broadcast` 시 이 `connectionId`를
기준으로 발신자 연결을 제외할 수 있다.

발신자 제외 방식도 가능하지만, 서버 로직을 단순하게 유지하기 위해 발신자가 자기 이벤트를 받더라도 `version` 비교로 중복 적용을 방지한다.

## 5. SSE 인증: 쿼리 파라미터 기반 토큰 전달

브라우저 표준 `EventSource` API는 커스텀 `Authorization` 헤더 설정을 지원하지 않는다.

```text
// 불가능
new EventSource('/api/timer/sse', {headers: {'Authorization': 'Bearer ...'}})

// 쿼리 파라미터로 토큰 전달
new EventSource(`/api/timer/sse?token=${encodeURIComponent(token)}`)
```

서버는 [TimerController.subscribe](../../backend/src/main/java/kr/io/flowmate/timer/controller/TimerController.java)에서 토큰을
직접 파싱·검증한다.

```text
@GetMapping(value = "/sse", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter subscribe(@RequestParam String token) {
    Claims claims;
    try {
        claims = jwtProvider.parseToken(token); // 만료·서명 동시 검증
    } catch (JwtException | IllegalArgumentException e) {
        throw new AuthenticationFailedException("유효하지 않은 토큰입니다.");
    }
    if (!"member".equals(claims.get("role", String.class))) {
        throw new AuthenticationFailedException("member 전용 엔드포인트입니다.");
    }
    return sseEmitterRegistry.register(claims.getSubject());
}
```

토큰 파싱과 만료 검증을 `parseToken` 한 번으로 처리한다. 검증 실패는 `AuthenticationFailedException`으로 통일해 401로 응답하고, `role=member`가 아니면 거절한다.

### 검토한 대안

| 방식                       | 장점                                   | 단점                            |
|--------------------------|--------------------------------------|-------------------------------|
| 단기 SSE 티켓 발급             | access token 원문 노출 방지, 노출 시 영향 범위 축소 | 발급 API, 저장소, 만료 정책, 일회성 처리 필요 |
| **쿼리 파라미터 access token** | 별도 인프라 없이 기존 토큰 재사용                  | URL 노출 위험                     |

단기 SSE 티켓은 보안상 더 안전하지만 발급 API, 저장소, 만료 정책이 모두 필요해 현재 규모에서는 복잡도가 높다고 판단했다.

대신 쿼리 파라미터로 access token을 전달하는 방식을 선택했다. 액세스 로그, Referer, 브라우저 history 등에 토큰이 기록될 수 있지만, HTTPS로 전송 구간을 보호하고 Access Token
TTL을 15분으로 짧게 유지해 노출 시 재사용 가능한 시간을 제한한다.

## 6. 트레이드오프 요약

| 결정                        | 얻은 것                  | 감수한 비용                 | 판단                      |
|---------------------------|-----------------------|------------------------|-------------------------|
| SSE + REST 선택             | 단순 인프라, Spring 내장 지원  | 클라이언트 → 서버는 REST 병행 필요 | 타이머 동기화는 단방향 push로 충분   |
| DB-only 정본                | 정본 단일화                | 초기 로딩 시 서버 의존          | snapshot fetch로 보완      |
| 단조 증가 `version`           | 이벤트 역전을 단일 정수로 해결     | 연결 끊김 중 이벤트는 replay 없음 | Last-Writer-Wins 구조에 충분 |
| `state_json = NULL`       | version 연속성 유지        | idle row 잔존            | version 연속성을 위해 유지      |
| 25초 heartbeat             | 중간망 단절 방지, 죽은 연결 감지   | 주기적 트래픽 발생             | 인프라 타임아웃만으로 중간망 통제 불가   |
| fire-and-forget broadcast | 한 연결 실패가 DB 저장을 막지 않음 | 일부 SSE 누락 가능           | 재접속 snapshot으로 해결       |
| 발신자 제외 없이 전체 broadcast    | 서버 로직 단순화             | 발신자도 자기 이벤트 수신         | version 비교로 클라이언트가 처리   |
| query parameter 토큰 인증     | 별도 인프라 없이 기존 토큰 재사용   | URL 노출 위험              | 짧은 TTL + HTTPS 전제에서 수용  |

## 7. 회고

### 수평 확장 시 Redis Pub/Sub 필요

현재 `SseEmitterRegistry`는 JVM 메모리에 연결을 보관한다. 서버 인스턴스가 하나일 때는 문제없지만, 수평 확장 시 같은 사용자가 PC(인스턴스 1에 연결)와 모바일(인스턴스 2에 연결)을 동시에
쓰는 상황에서 모바일에서 타이머를 변경하면 인스턴스 2만 broadcast하므로 인스턴스 1에 연결된 PC는 이벤트를 받지 못한다.

해결책은 Redis Pub/Sub으로 인스턴스 간 이벤트를 공유하는 것이다. 서버는 DB 저장 후 Redis 채널에 publish하고, 모든 인스턴스가 구독해 자신에게 연결된 클라이언트에게 broadcast한다.
현재 규모(단일 EC2)에서는 불필요하지만, 트래픽이 늘어 인스턴스를 추가하는 시점에 첫 번째로 고려할 컴포넌트다.

### 타이머 상태 캐싱도 함께 개선 가능

타이머 상태 저장소도 Redis 도입 시 함께 개선할 수 있다. MySQL을 정본으로 유지하되 Redis를 캐시 레이어로 추가하면, 타이머 변경 시 MySQL 저장 후 Redis를 갱신하고 Pub/Sub으로
broadcast한다.

Snapshot fetch는 Redis 캐시 hit 시 즉시 반환하고 miss 시 MySQL을 조회하며, version 단조 증가와 soft delete 로직은 MySQL이 그대로 담당하므로 기존 구조를 크게 바꾸지
않고 읽기 성능과 인스턴스 간 동기화를 동시에 개선할 수 있다.
