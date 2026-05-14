# Timer State 저장 경로의 InnoDB Deadlock 분석과 해결

## 요약

- 문제 배경: timer state 저장 API에서 부하테스트 중 deadlock 발생
- 현상 분석: k6 endpoint별 실패 분포와 backend log로 timer state INSERT 실패 확인
- 원인: row가 없는 first insert 경로에서 `SELECT FOR UPDATE`가 gap lock을 만들고, 동시 INSERT의 insert intention lock과 충돌
- 해결: `PESSIMISTIC_WRITE` 제거 후 first insert 유일성 제약 조건 충돌을 catch-retry로 복구
- 검증: 수정 후 전체 요청 163,205건 기준 timer PUT 실패 0건, `http_req_failed` 0.00%

## 1. 문제 배경

### 타이머 SSE 동작 흐름

FlowMate의 타이머는 사용자가 여러 탭이나 기기에서 같은 타이머 상태를 볼 수 있도록, 타이머 상태를 서버에 저장하고 SSE로 전파한다.

흐름은 단순하다.

```text
기기 A: PUT /api/timer/state/{todoId}
서버:   timer_states 저장
서버:   같은 userId의 SSE 연결에 timer-state broadcast
기기 B: SSE 수신 후 Zustand timer store 반영
```

### main 배포 전 부하테스트 실행

main 환경 배포 전 2026년 3월 26일 dev 환경에서 broad baseline으로 부하 테스트를 진행했다.

- 구성: max 12 VU, 10분
- 전체 요청: 112,132건
- `checks`: 99.93%
- `http_req_failed`: 0.06%
- baseline 전체 p95: 64.62ms
- baseline 전체 p99: 157.58ms

전역 threshold 기준으로는 통과였지만, 실패 분포를 endpoint 단위로 쪼개자 결론이 달라졌다.

| 실패 구간                                   | 실패 수 |
|-----------------------------------------|-----:|
| `PUT /api/timer/state/{todoId}` running |   68 |
| `PUT /api/timer/state/{todoId}` paused  |    1 |
| 기타 API                                  |    0 |

총 69건의 실패가 사실상 timer state 저장 경로에 집중됐다.

즉, 수동 기능 테스트와 단일 사용자 흐름에서는 정상처럼 보였지만, k6 baseline을 통해 부하 테스트를 돌리자 특정 경로에서 숨어 있던 동시성 버그가 드러났다.

## 2. 현상 분석

백엔드 로그에는 다음과 같은 에러가 남아 있었다.

```text
2026-03-26T10:43:03.672Z  WARN  ... ErrorCode: 1213, SQLState: 40001
2026-03-26T10:43:03.672Z  WARN  ... Deadlock found when trying to get lock; try restarting transaction
2026-03-26T10:43:03.673Z ERROR ... CannotAcquireLockException

org.springframework.dao.CannotAcquireLockException:
could not execute statement
[Deadlock found when trying to get lock; try restarting transaction]
[insert into timer_states (created_at,state_json,updated_at,user_id,version,todo_id) values (?,?,?,?,?,?)]
```

핵심 정보는 아래와 같다.

```text
ErrorCode: 1213
SQLState: 40001
Exception: CannotAcquireLockException
Message: Deadlock found when trying to get lock; try restarting transaction
SQL: insert into timer_states (created_at, state_json, updated_at, user_id, version, todo_id)
     values (?, ?, ?, ?, ?, ?)
```

## 3. 원인

### 왜 처음에 lock을 걸었나

당시 repository 조회에는 비관적 락인 `@Lock(PESSIMISTIC_WRITE)`가 걸려 있었다.
동시에 같은 Todo의 타이머 상태를 바꾸는 요청이 들어와도 `SELECT FOR UPDATE`로 row를 잠그고, `version` 증가가 꼬이지 않도록 하려는 의도였다.

### 왜 문제가 됐나

문제의 핵심은 `timer_states`에 row가 아직 없을 때의 첫 저장 경로였다.

당시 구현은 다음과 같은 순서로 동작했다.

```text
TimerController.pushState(todoId)
  -> TimerService.upsertState(userId, todoId, request)
    -> timerStateRepository.findByUserIdAndTodoId(userId, todoId)
    -> row가 없으면 TimerState.create(todoId, userId)
    -> timerStateRepository.saveAndFlush(timerState)
       -> INSERT 시점에 deadlock
```

row가 이미 존재할 때는 이 전략이 의도대로 동작한다.
`SELECT FOR UPDATE`가 해당 record lock을 잡고, 다른 요청은 앞선 트랜잭션이 끝날 때까지 기다린다.

하지만 row가 없으면 잠글 record가 없다.
이때 InnoDB는 존재하지 않는 row 대신 인덱스의 빈 공간인 gap을 잠글 수 있다.
여러 요청이 동시에 gap lock을 잡은 뒤 INSERT를 시도하면, INSERT에 필요한 insert intention lock이 서로의 gap lock과 충돌하면서 deadlock이 발생할 수 있다.

```text
요청 A: SELECT FOR UPDATE -> row 없음 -> gap lock 획득
요청 B: SELECT FOR UPDATE -> row 없음 -> gap lock 획득

요청 A: INSERT 시도 -> insert intention lock 필요
요청 B: INSERT 시도 -> insert intention lock 필요

서로의 gap lock 때문에 insert intention lock 대기
-> 순환 대기
-> MySQL이 한 트랜잭션 롤백
-> 1213 deadlock
```

### deadlock graph로 확인

`SHOW ENGINE INNODB STATUS\G`의 deadlock graph도 같은 방향을 가리켰다.

```text
*** (1) TRANSACTION:
TRANSACTION 167508, ACTIVE 0 sec inserting

*** (1) HOLDS THE LOCK(S):
RECORD LOCKS space id 10 page no 4 index PRIMARY
  lock_mode X locks gap before rec

*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 10 page no 4 index PRIMARY
  lock_mode X locks gap before rec insert intention waiting

*** (2) TRANSACTION:
TRANSACTION 167514, ACTIVE 0 sec inserting

*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 10 page no 4 index PRIMARY
  lock_mode X locks gap before rec

*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 10 page no 4 index PRIMARY
  lock_mode X locks gap before rec insert intention waiting
```

두 트랜잭션 모두 `PRIMARY` 인덱스의 gap lock을 보유한 채 insert intention lock을 기다리고 있었다.
즉, 단순히 애플리케이션 레벨에서 요청이 많아서 실패한 것이 아니라, row가 없는 first insert 경로에서 `SELECT FOR UPDATE`가 DB 수준의 lock 충돌을 만들고 있었다.

### 원인 정리

정리하면 원인은 다음과 같다.

1. `SELECT FOR UPDATE`가 존재하지 않는 row를 조회한다.
2. InnoDB가 record lock 대신 gap lock을 잡는다.
3. 여러 트랜잭션이 gap lock을 보유한 상태에서 INSERT를 시도한다.
4. INSERT에는 insert intention lock이 필요하다.
5. insert intention lock이 다른 트랜잭션의 gap lock과 충돌한다.
6. 순환 대기가 생기고 MySQL이 한 트랜잭션을 롤백한다.

## 4. 해결안 비교

검토한 선택지는 아래와 같았다.

| 선택지                                    | 장점                                            | 단점                                        | 판단                                    |
|----------------------------------------|-----------------------------------------------|-------------------------------------------|---------------------------------------|
| Native upsert                          | DB 레벨 atomic 처리                               | JPA 중심 코드에서 native SQL 증가, 트랜잭션 제어 복잡도 증가 | 가장 견고하지만 현재 timer state 도메인에는 과하다고 판단 |
| `TransactionTemplate` + deadlock retry | deadlock 발생 시 세밀한 복구 가능                       | gap lock 원인은 유지되고, 증상 완화에 가까움             | 근본 원인 제거보다 복잡도 증가가 큼                  |
| `@Lock` 제거 + catch-retry               | first insert gap lock 경로 제거, 기존 코드 패턴과 일관성 유지 | 최초 충돌 시 재조회 쿼리 1회 추가                      | 현재 도메인 특성상 가장 단순하고 충분한 해결책            |

### 결론: `@Lock` 제거 + catch-retry

최종적으로는 `@Lock` 제거 + catch-retry 방법을 채택했다.

native upsert는 DB 레벨에서 가장 원자적인 해결책이다.
하지만 현재 timer state는 최신 상태를 계속 push하는 last-writer-wins 성격의 데이터다.
기존 코드베이스도 JPA 중심으로 구성돼 있었기 때문에, 이 문제 하나 때문에 native SQL과 트랜잭션 경계 복잡도를 추가하는 것은 비용 대비 이득이 크지 않다고 판단했다.

`TransactionTemplate` 기반 deadlock retry도 선택지였다.
하지만 이 방식은 deadlock이 발생한 뒤 트랜잭션 전체를 다시 시도하는 구조다.
gap lock을 유발한 `SELECT FOR UPDATE` 경로는 그대로 남기 때문에, 원인 제거보다는 증상 완화에 가깝다고 봤다.

따라서 first insert 경로에서 `SELECT FOR UPDATE`를 제거하고, 이후 남는 first insert 경합은 유일성 제약 조건 충돌로 수렴시키는 방향을 선택했다.
같은 프로젝트의 `TodoService.scheduleReview`가 이미 유사한 catch-retry 패턴을 쓰고 있어 코드 일관성도 유지할 수 있었다.

정합성이 더 강하게 필요한 데이터였다면 native upsert, optimistic locking, 명시적인 retry 정책을 더 적극적으로 검토했을 것이다.
하지만 timer state는 누적 정합성이 중요한 데이터라기보다 사용자의 최신 타이머 상태를 반영하는 데이터다.
이 경로에서는 last-writer-wins 모델을 수용할 수 있다고 판단했다.

## 5. 해결

### 1) `@Lock(PESSIMISTIC_WRITE)` 제거

기존 repository 조회는 `PESSIMISTIC_WRITE`를 사용했다.

```text
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select t from TimerState t where t.userId = :userId and t.todoId = :todoId")
Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);
```

수정 후에는 lock 없는 일반 SELECT로 바꿨다.

```text
Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);
```

이 변경으로 row가 없는 first insert 경로에서 `SELECT FOR UPDATE`가 먼저 gap lock을 잡는 구조를 제거했다.

기존 row에 대한 동시 UPDATE는 last-writer-wins 모델로 처리한다.
timer state는 사용자의 최신 타이머 상태를 저장하는 데이터이고, 모든 중간 상태를 누적해 정산하는 데이터가 아니다.
SSE 이벤트도 `version` 기반으로 최신성을 판단하므로, 네트워크 순서가 뒤바뀌어도 오래된 이벤트가 다시 적용되지 않는다.

### 2) first insert 충돌은 catch-retry로 복구

`@Lock`을 제거하면 같은 `userId`, `todoId`에 대해 두 요청이 동시에 최초 INSERT를 시도할 수 있다.
이때 한 요청은 INSERT에 성공하고, 다른 요청은 `timer_states`의 유일성 제약 조건 위반으로 실패할 수 있다.

기존에는 `saveAndFlush`에서 발생한 INSERT 실패가 그대로 예외로 전파됐다.

```text
timerStateRepository.saveAndFlush(timerState);
```

수정 후에는 `saveAndFlush` 지점에서 유일성 제약 조건 위반을 잡고, 이미 INSERT에 성공한 winner row를 다시 읽어 UPDATE한다.

```text
try {
    timerStateRepository.saveAndFlush(timerState);
} catch (DataIntegrityViolationException e) {
    log.warn("timer state 유일성 제약 조건 충돌, 재조회 후 업데이트. todoId={}", todoId);
    timerState = timerStateRepository.findByUserIdAndTodoId(userId, todoId)
        .orElseThrow(() -> e);
    newVersion = nextVersion(timerState.getVersion());
    timerState.update(stateJson, newVersion);
    timerStateRepository.saveAndFlush(timerState);
}
```

여기서 가장 중요한 부분은 catch 블록에서 `newVersion`을 다시 계산하는 것이다.

클라이언트는 todo별 마지막 적용 version보다 작은 이벤트를 무시하기 때문에 version은 단조 증가해야 한다.

loser 요청이 처음 계산한 `newVersion`을 그대로 사용하면, winner row보다 작은 version으로 UPDATE할 수 있다.
그래서 유일성 제약 조건 충돌 후에는 DB에 저장된 winner row의 version을 기준으로 다시 계산해야 한다.

예를 들면 다음과 같다.

```text
Thread A: row 없음 -> newVersion = 1_700_000_000_000
Thread B: row 없음 -> newVersion = 1_700_000_000_001

Thread B: INSERT 성공 -> DB version = 1_700_000_000_001
Thread A: 유일성 제약 조건 충돌 후 재조회

잘못된 처리:
Thread A가 기존 newVersion 그대로 UPDATE
-> DB version = 1_700_000_000_000
-> winner보다 작은 version으로 역전

올바른 처리:
Thread A가 winner row version 기준으로 nextVersion 재계산
-> DB version = 1_700_000_000_002
-> 단조 증가 유지
```

이렇게 해야 first insert 경합을 복구하면서도 SSE 최신성 판단에 필요한 version 단조 증가를 유지할 수 있다.

## 6. 검증

수정 후 2026년 3월 28일 dev 환경에서 fresh token 기준으로 smoke와 baseline을 다시 실행했다.

| 지표                | 수정 전: 2026-03-26 | 수정 후: 2026-03-28 |
|-------------------|-----------------:|-----------------:|
| 전체 요청             |          112,132 |          163,205 |
| timer PUT 실패      |              69건 |               0건 |
| `http_req_failed` |            0.06% |            0.00% |
| `checks`          |           99.93% |          100.00% |
| baseline 전체 p95   |          64.62ms |          45.58ms |
| baseline 전체 p99   |         157.58ms |         150.14ms |
| max latency       |            1.63s |         891.99ms |

수정 후 테스트는 수정 전보다 전체 요청 수가 약 46% 많았음에도 timer PUT 실패가 69건에서 0건으로 감소했다.
따라서 단순히 부하가 낮아져 실패가 줄어든 것이 아니라, first insert deadlock 경로가 제거된 것으로 판단했다.

## 7. 회고

### 전역 threshold 통과가 endpoint 정상성을 보장하지 않는다.

전체 실패율 0.06%는 낮아 보인다. 하지만 그 실패가 핵심 write path 하나에 집중되면 제품 정합성 문제다. 부하 테스트 결과는 평균이나 전체 threshold만 보지 말고 endpoint별 실패 분포까지 봐야 한다.

### PESSIMISTIC_WRITE는 row가 없을 때 다른 락 동작을 만든다

row가 존재하면 SELECT FOR UPDATE는 record lock으로 동작하지만, row가 없으면 InnoDB가 gap lock을 잡을 수 있다. ORM의 락 어노테이션만 보고 판단하지 말고, 실제 DB lock graph로 확인해야 한다.

### 오버 엔지니어링보다는 프로젝트 패턴에 맞는 최소 수정이 더 낫다.

native upsert는 기술적으로 매력적이고 견고한 선택이었다. 하지만 현재 프로젝트에는 native SQL과 트랜잭션 경계 복잡도를 추가할 만큼의 이득이 비용 대비 크지 않았다. 원인을 만든 @Lock을 제거하고, 남은 first insert 충돌만 기존 catch-retry 패턴으로 단순히 처리하는 방법이 더 좋은 해법이었다.
