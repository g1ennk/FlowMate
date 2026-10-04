# 타이머 상태 저장의 동시성 제어: InnoDB Deadlock 분석과 해결

## 요약

**1차: 타이머 저장 deadlock**

- 문제: k6 12VU 부하 테스트에서 timer PUT에 deadlock 69건 발생. first insert 시 gap lock과 insert intention lock 충돌
- 해결: `PESSIMISTIC_WRITE` 제거 + first insert 충돌을 catch-retry로 복구
- 결과: 요청 46% 증가(112K -> 163K)에도 timer PUT 실패 0건, `http_req_failed` 0.00%, p95 64.62 -> 45.58ms(29%↓)

**2차: 1차 해결의 한계 ([6절](#6-후속-검증과-최종-해결))**

- 문제: 1차 때 채택한 catch-retry가 동작하지 않아 동시 최초 저장 4건 중 3건이 실패했고, 락 제거로 동시 갱신의 version이 중복되거나 역전됐다
- 해결: `INSERT … ON DUPLICATE KEY UPDATE` 원자적 upsert + DB가 올리는 순차 version
- 결과: 동시 최초 저장 30/120 → 120/120 성공, version 중복과 역전 0건, 기존 deadlock 재발 0건

## 1. 문제 배경

FlowMate의 타이머는 상태를 서버에 저장하고 [SSE로 멀티디바이스 동기화](sse-sync.md)한다.

단일 사용자 흐름에서는 정상이었지만, k6 부하 테스트에서 특정 경로에 실패가 집중됐다.

### 부하테스트에서 발견

2026년 3월 26일 dev 환경에서 baseline 부하 테스트를 진행했다.

| 항목                |              값 |
|-------------------|---------------:|
| 구성                | max 12 VU, 10분 |
| 전체 요청             |       112,132건 |
| `checks`          |         99.93% |
| `http_req_failed` |          0.06% |
| p95               |        64.62ms |
| p99               |       157.58ms |

전체 실패율 0.06%는 낮아 보이지만, endpoint별로 쪼개자 실패가 한 경로에 집중돼 있었다.

| 실패 구간                                   | 실패 수 |
|-----------------------------------------|-----:|
| `PUT /api/timer/state/{todoId}` running |   68 |
| `PUT /api/timer/state/{todoId}` paused  |    1 |
| 기타 API                                  |    0 |

총 69건의 실패가 타이머 상태 저장 경로에 집중됐다.

## 2. 원인

### 증상

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

ErrorCode 1213(SQLState 40001)은 InnoDB deadlock이고, 실패한 문장은 `timer_states`의 first insert였다.

### 왜 처음에 lock을 걸었나

당시 repository 조회에는 비관적 락인 `@Lock(PESSIMISTIC_WRITE)`를 걸었다.
동시에 같은 Todo의 타이머 상태를 바꾸는 요청이 들어와도 `SELECT FOR UPDATE`로 row를 잠그고, `version` 증가가 꼬이지 않도록 하려는 의도였다.

### 왜 문제가 됐나

문제의 핵심은 `timer_states`에 row가 아직 없을 때의 첫 저장 경로였다.

당시 구현은 다음과 같은 순서로 동작했다.

```text
TimerController.pushState(todoId)
  → TimerService.upsertState(userId, todoId, request)
    → timerStateRepository.findByUserIdAndTodoId(userId, todoId)
    → row가 없으면 TimerState.create(todoId, userId)
    → timerStateRepository.saveAndFlush(timerState)
       → INSERT 시점에 deadlock
```

row가 이미 존재할 때는 이 전략이 의도대로 동작한다.
`SELECT FOR UPDATE`가 해당 record lock을 잡고, 다른 요청은 앞선 트랜잭션이 끝날 때까지 기다린다.

하지만 row가 없으면 잠글 record가 없다.
이때 InnoDB는 존재하지 않는 row 대신 인덱스의 빈 공간인 gap을 잠글 수 있다.
여러 요청이 동시에 gap lock을 잡은 뒤 INSERT를 시도하면, INSERT에 필요한 insert intention lock이 서로의 gap lock과 충돌하면서 deadlock이 발생할 수 있다.

```text
요청 A: SELECT FOR UPDATE → row 없음 → gap lock 획득
요청 B: SELECT FOR UPDATE → row 없음 → gap lock 획득

요청 A: INSERT 시도 → insert intention lock 필요
요청 B: INSERT 시도 → insert intention lock 필요

서로의 gap lock 때문에 insert intention lock 대기
→ 순환 대기
→ MySQL이 한 트랜잭션 롤백
→ 1213 deadlock
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

### 서로 다른 Todo끼리도 충돌했다

k6 시나리오는 반복마다 새 Todo를 만들어 같은 Todo에 요청이 겹치지 않았는데도 deadlock이 났다. 그래서 dev 서버에 회원 한 명의 서로 다른 `todo_id` 16개로 첫 저장을 동시에 보냈고, 200이 5건, 500이 11건이었다. `SHOW ENGINE INNODB STATUS`도 같은 `PRIMARY` 인덱스의 gap lock deadlock을 보였다.

gap lock은 키 하나가 아니라 그 키가 들어갈 빈 구간을 잠근다. `todo_id`가 UUID라 새 키가 들어갈 자리는 무작위고, 서로 다른 Todo라도 같은 구간에 떨어지면 같은 구간을 잠근다. 테이블에 행이 적을수록 구간이 적고 넓어서 동시에 들어온 첫 저장끼리 더 자주 겹친다. 부하가 아니라 구조 문제였다.

### 원인 정리

정리하면 원인은 다음과 같다.

1. `SELECT FOR UPDATE`가 존재하지 않는 row를 조회한다.
2. InnoDB가 record lock 대신 gap lock을 잡는다.
3. 여러 트랜잭션이 gap lock을 보유한 상태에서 INSERT를 시도한다.
4. INSERT에는 insert intention lock이 필요하다.
5. insert intention lock이 다른 트랜잭션의 gap lock과 충돌한다.
6. 순환 대기가 생기고 MySQL이 한 트랜잭션을 롤백한다.

## 3. 해결안 비교

| 선택지                                    | 장점                       | 단점                      | 판단                 |
|----------------------------------------|--------------------------|-------------------------|--------------------|
| Native upsert                          | DB 레벨 atomic 처리          | native SQL과 트랜잭션 복잡도 증가 | 견고하지만 현재 도메인에 과잉   |
| `TransactionTemplate` + deadlock retry | deadlock 후 세밀한 복구        | gap lock 원인 유지, 증상 완화   | 근본 원인 제거보다 복잡도 증가  |
| **`@Lock` 제거 + catch-retry**           | gap lock 경로 제거, 기존 패턴 일관 | 충돌 시 재조회 1회 추가          | **채택**. 가장 단순하고 충분 |

타이머 상태는 최신 값을 계속 덮어쓰는 last-writer-wins 성격의 데이터라, native upsert 수준의 원자성은 불필요했다. TransactionTemplate retry도 gap lock 원인을
유지한 채 증상만 완화하는 구조라 제외했다.

gap lock을 유발한 `@Lock`을 제거하고, 남는 first insert 경합은 유일성 제약 조건 충돌을 catch-retry로 복구하는 방향을 선택했다. 타이머는 사용자와 Todo별로 나뉘고 조작도 사람 손으로만 일어나, 같은 Todo에 동시 저장이 몰리는 일은 드물 것으로 예상했다. 같은 프로젝트의
`TodoService.scheduleReview`가 이미 유사한 패턴을 쓰고 있어 코드 일관성도 유지할 수 있었다.

> 이 판단은 후속 검증에서 뒤집혔다. 같은 트랜잭션 안의 catch-retry는 동작하지 않았고, 락을 지우면서 version이 중복되거나 역전됐다. 최신 값으로 덮어쓰는 데이터라도, 각 기기는 version이 더 큰 이벤트만 화면에 반영하므로 version이 틀리면 최신 상태를 버리게 된다. 그래서 저장과 version 증가를 한 번에 처리하는 upsert를 선택했다([6절](#6-후속-검증과-최종-해결)).

## 4. 해결

### 1) `@Lock(PESSIMISTIC_WRITE)` 제거

기존 repository 조회는 `PESSIMISTIC_WRITE`를 사용했다.

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("select t from TimerState t where t.userId = :userId and t.todoId = :todoId")
Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);
```

수정 후에는 lock 없는 일반 SELECT로 바꿨다.

```java
Optional<TimerState> findByUserIdAndTodoId(String userId, String todoId);
```

이 변경으로 first insert 경로에서 gap lock을 잡는 구조를 제거했다.

### 2) first insert 충돌은 catch-retry로 복구

`@Lock`을 제거하면 같은 `userId`, `todoId`에 대해 두 요청이 동시에 최초 INSERT를 시도할 수 있다.
이때 한 요청은 INSERT에 성공하고, 다른 요청은 `timer_states`의 유일성 제약 조건 위반으로 실패할 수 있다.

기존에는 `saveAndFlush`에서 발생한 INSERT 실패가 그대로 예외로 전파됐다.

```java
timerStateRepository.saveAndFlush(timerState);
```

수정 후에는 `saveAndFlush` 지점에서 유일성 제약 조건 위반을 잡고, 이미 INSERT에 성공한 winner row를 다시 읽어 UPDATE한다.

```java
try {
    timerStateRepository.saveAndFlush(timerState);
} catch (DataIntegrityViolationException e) {
    log.warn("timer state PK 충돌, 재조회 후 업데이트. todoId={}", todoId);
    timerState = timerStateRepository.findByUserIdAndTodoId(userId, todoId)
        .orElseThrow(() -> e);
    newVersion = nextVersion(timerState.getVersion());
    timerState.update(stateJson, newVersion);
    timerStateRepository.saveAndFlush(timerState);
}
```

핵심은 catch 블록에서 `newVersion`을 winner row의 version 기준으로 다시 계산하는 것이다. 클라이언트는 version이 작은 이벤트를 무시하므로 단조 증가가 깨지면 안 된다.

```text
Thread A: row 없음 → newVersion = 1_700_000_000_000
Thread B: row 없음 → newVersion = 1_700_000_000_001

Thread B: INSERT 성공 → DB version = 1_700_000_000_001
Thread A: 유일성 제약 조건 충돌 후 재조회

잘못된 처리:
Thread A가 기존 newVersion 그대로 UPDATE
→ DB version = 1_700_000_000_000
→ winner보다 작은 version으로 역전

올바른 처리:
Thread A가 winner row version 기준으로 nextVersion 재계산
→ DB version = 1_700_000_000_002
→ 단조 증가 유지
```

> 후속 검증 결과, 이 catch-retry는 실제 MySQL에서 한 번도 복구하지 못했다([6절](#6-후속-검증과-최종-해결)).

## 5. 검증

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

## 6. 후속 검증과 최종 해결

### 1차 해결을 다시 검증하다

catch-retry는 같은 Todo에 동시 저장이 몰릴 때만 실행되는데, k6는 반복마다 새 Todo를 써서 이 경로를 타지 않았다. 그래서 실제 MySQL에서 같은 Todo에 요청 4개를 동시에 보내는 테스트를 30번 돌렸고, 두 가지 문제가 발생했다.

| 문제        | 결과                        | 원인                                                                                     |
|-----------|---------------------------|----------------------------------------------------------------------------------------|
| 최초 저장     | 120건 중 90건 실패(500)        | 실패한 INSERT를 같은 트랜잭션에서 재시도했다. 한 번 실패한 트랜잭션은 예외를 잡아도 복구되지 않는다 |
| 기존 행 갱신   | version 중복 30/30라운드, 역전 발생 | 락이 사라져 두 요청이 같은 이전 version으로 계산했다 |

두 번째 문제는 락 제거가 만든 회귀였다. 과거 잠금 코드로 같은 테스트를 돌리면 0건이었다. 락이 기존 행의 읽기, 계산, 쓰기를 한 줄로 세워 주고 있었던 것이다.

### 원자적 upsert로 전환

두 문제의 근본 원인은 같았다. 행이 있는지와 다음 version을 잠금 없이 판단한 뒤 그대로 썼다. 그래서 판단과 쓰기를 한 번에 처리하고자 했다.

```sql
INSERT INTO timer_states (todo_id, user_id, state_json, version, created_at, updated_at)
VALUES (:todoId, :userId, :stateJson, 1, :now, :now) AS incoming
ON DUPLICATE KEY UPDATE
    state_json = incoming.state_json,
    version    = timer_states.version + 1,
    updated_at = incoming.updated_at
```

- version은 DB가 계산한다. 같은 Todo의 동시 쓰기는 행 잠금으로 한 줄로 서므로 겹치거나 뒤집히지 않는다
- 저장한 version을 같은 트랜잭션에서 다시 읽어 응답과 SSE 이벤트에 쓴다
- 기존에는 조회할 때 24시간 지난 행을 삭제했다. 순차 version에서 행을 지우면 version이 1부터 다시 시작하므로, 삭제하지 않고 복원 목록에서만 뺀다
- 저장 중 Todo가 삭제되면 생기는 FK 오류만 404로 바꾼다

부모 Todo 행을 먼저 잠그는 방법도 실측했다. 두 문제는 똑같이 해결됐지만, "타이머를 쓰는 모든 경로가 Todo 잠금을 먼저 잡는다"는 규칙이 지켜져야 했다. 24시간 지난 행을 지우던 조회 경로는 Todo 잠금 없이 행을 지워서, 동시 저장의 절반이 실패했다.

upsert는 한 문장 안에서 생성과 갱신을 진행하므로, 다른 쓰기 경로에 규칙을 강제하지 않아도 되기에 upsert를 선택했다.

### 검증

| 시나리오 (실제 MySQL, 30라운드, 3회 연속) | 수정 전         | 수정 후       |
|-------------------------------|--------------|------------|
| 같은 Todo 동시 최초 저장             | 30/120 성공    | 120/120 성공 |
| 기존 행 동시 갱신                   | version 중복과 역전 | 위반 0       |
| 과거 deadlock 경로               | -            | 재발 0건      |

이 시나리오들은 회귀 테스트로 코드에 남겼다.

## 7. 회고

### 전역 threshold 통과가 endpoint 정상성을 보장하지 않는다.

전체 실패율 0.06%는 낮아 보인다. 하지만 그 실패가 특정 endpoint에 집중되면 제품 문제일 가능성이 크다. 부하 테스트 결과는 평균이나 전체 threshold만 보지 말고 endpoint별 실패 분포까지
봐야 한다.

### PESSIMISTIC_WRITE는 row가 없을 때 다른 락 동작을 만든다

row가 존재하면 SELECT FOR UPDATE는 record lock으로 정상적으로 동작하지만, row가 없으면 InnoDB가 gap lock을 잡을 수 있다. ORM의 락 어노테이션만 보고 판단하지 말고, 실제 DB
lock graph까지 확인해서 확실하게 원인 파악을 해야 한다.

### deadlock이 사라진 것과 동시성이 보장된 것은 다르다

1차 해결은 유의미했다. 원인 가설(없는 행에 대한 `FOR UPDATE`의 gap lock 충돌)대로 락을 지우자 관측하던 deadlock이 사라졌고 동일한 부하테스트도 문제 없이 통과했다. 문제는 검증한 범위와 해결했다고 믿은 범위가 다소 차이가 있었다는 점이다.

- k6는 처리량 baseline용이라 반복마다 새 Todo를 썼고, 그래서 catch-retry 경로를 한 번도 타지 않았다. 검증은 문제를 찾은 테스트를 다시 돌리는 데서 끝났다
- catch-retry는 mock으로만 확인했다. mock은 예외는 던져도 실패한 뒤의 트랜잭션 상태는 재현하지 못한다
- 지운 락은 deadlock의 원인이면서 동시에 기존 행의 갱신을 한 줄로 세워 주던 보호 장치였다

실패 0건은 "그 시나리오에서 관측되지 않았다"는 뜻이지 "모든 동시 저장이 안전하다"는 결론은 아니었다. 버그를 일으킨 코드를 지울 때는 그 코드가 무엇을 일으켰는지뿐 아니라 무엇을 막아 주고 있었는지도 확인해야 한다.

이후 다중 인스턴스 확장은 [Redis Pub/Sub으로 SSE 수평 확장하기](redis-sse-pubsub.md)에 정리했다.
