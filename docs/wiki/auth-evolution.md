# FlowMate 인증 시스템 진화: X-Client-Id에서 OAuth + RTR까지

## 요약

- 문제: 서명 및 TTL 없는 `X-Client-Id`는 사용자 신원 증명 불가, 장기적인 인증 모델로는 부적합
- 선택 기준: 게스트 연속성 유지 + XSS·CSRF 위험 최소화 + 다중 기기 세션 허용
- 결과: Memory Access Token + HttpOnly Refresh Token + RTR + Reuse Detection 조합으로 토큰 탈취 대응

## 1. 문제 배경 및 타임라인

초기 MVP의 목표는 사용자가 회원가입이나 OAuth 로그인 없이 Todo와 타이머 기능을 바로 써보며 제품 흐름을 검증하게 하는 것이었다.

이후 백엔드가 도입되면서 인증 요구사항이 생겼고, 네 번의 큰 변화를 거쳤다.

| Phase   | 시점                    | 핵심 변화                                                        |
|---------|-----------------------|--------------------------------------------------------------|
| Phase 1 | 2026-01-09~2026-02-21 | 백엔드 없는 프론트 MVP → `X-Client-Id` 기반 API 식별                     |
| Phase 2 | 2026-02-27            | 로그인 도입: JWT + Kakao OAuth, memory AT, HttpOnly RT, State JWT |
| Phase 3 | 2026-03-01            | 다중 기기 로그인 + RTR                                              |
| Phase 4 | 2026-04-10~2026-04-25 | RTR 이후 revoke 정책 및 Reuse Detection 명시화                       |

## 2. 보안 전략

각 Phase의 설계 결정은 아래 위협을 기준으로 판단했다.

| 위협                    | 경로                       | 대응                                  |
|-----------------------|--------------------------|-------------------------------------|
| XSS로 Access Token 탈취  | 악성 스크립트가 localStorage 읽기 | Memory 저장 (localStorage 미사용)        |
| CSRF로 인가되지 않은 요청      | 외부 사이트에서 쿠키 자동 전송        | SameSite=Lax + `Path=/api/auth`     |
| OAuth callback 위조     | 공격자가 만든 redirect URL로 유도 | State JWT 서명 검증 + sessionStorage 비교 |
| Refresh Token 원문 유출   | DB 탈취 후 RT 원문으로 재발급      | HttpOnly cookie + SHA-256 hash만 저장  |
| 탈취된 Refresh Token 재사용 | 탈취 후 지속 재발급              | RTR + Reuse Detection (revoke-all)  |

## 3. Phase 1: 프론트 로컬 MVP에서 X-Client-Id API 식별까지

| 구분 | 내용                                                                  |
|----|---------------------------------------------------------------------|
| 요구 | 로그인 없이 Todo와 타이머 기능을 먼저 검증                                          |
| 결정 | 프론트 MVP는 localStorage/MSW로 구현하고, API 경계가 생긴 뒤 `X-Client-Id`로 게스트 식별 |
| 결과 | 빠른 제품 검증은 가능했지만, 서명/TTL이 없는 브라우저 입력값을 장기 인증 모델로 쓰기에는 한계가 명확         |

이후 백엔드가 본격적으로 도입되면서 프론트엔드가 브라우저 UUID를 `localStorage`에 저장하고 `X-Client-Id` 헤더로 보냈다. 백엔드는 이 헤더를 읽어 UUID 형식만 검증했다.

이 선택은 초기 MVP 측면에선 합리적이었다. 복잡한 서버 세션, OAuth provider 설정, 로그인 UI 없이도 사용자별 데이터를 나눌 수 있기 때문이다. 다만 백엔드가 검증하는 것은 사용자의 신원이 아니라
브라우저가 보낸 문자열과 UUID 형식뿐이었다. 값이 서명되지 않고 만료되지 않으며 요청자가 바꿀 수 있다는 점에서, `X-Client-Id`는 장기 인증 모델이 아닌 임시 식별자에 가까웠다.

## 4. Phase 2: 로그인 도입

| 구분 | 내용                                                                                           |
|----|----------------------------------------------------------------------------------------------|
| 요구 | 게스트 사용자와 회원 사용자를 구분하고, Kakao OAuth 로그인 후 회원 세션을 유지                                           |
| 결정 | guest/member JWT, memory access token, HttpOnly refresh token, DB hash 저장, State JWT 도입      |
| 결과 | 서명된 token으로 사용자를 검증하고, 장기 token 노출 위험을 줄이는 구조로 변경                                            |
| 대안 | Spring Security OAuth2 Client도 검토했지만, OAuth 흐름을 이해하기 위해 직접 구현을 선택. Provider가 늘어나는 시점에 재검토 예정 |

### 토큰 정책

| 토큰                | 저장 위치                           | TTL                        | 목적               | 주요 판단                             |
|-------------------|---------------------------------|----------------------------|------------------|-----------------------------------|
| Guest JWT         | `localStorage`                  | 90일 — 재방문 시 데이터 유지         | 로그인 전 사용자 식별     | 새로고침·재방문 후 복원 필요, XSS 위험보다 연속성 우선 |
| Member Access JWT | 브라우저 메모리                        | 15분 — 탈취 시 노출 최소화          | API 인가           | 장기 보관 token의 XSS 노출 위험 완화         |
| State JWT         | `sessionStorage`, callback 후 삭제 | 5분 — OAuth 플로우 완료 시간       | OAuth CSRF 방어    | 서버 저장소 없이 서명만으로 검증                |
| Refresh Token     | HttpOnly cookie                 | 14일 — 재로그인 없이 사용 가능한 최대 기간 | access token 재발급 | JavaScript 직접 접근 차단, 서버에는 hash 저장 |

## 5. Phase 3: 다중 기기 로그인과 RTR

| 구분 | 내용                                                                                                                    |
|----|-----------------------------------------------------------------------------------------------------------------------|
| 요구 | 타이머에 SSE를 도입하면서 PC와 모바일, 여러 탭에서 같은 계정을 동시에 유지 필요                                                                      |
| 결정 | login 시 기존 active refresh token을 유지하고, refresh 성공 시 현재 token만 회전                                                      |
| 결과 | 기기별 refresh token chain이 생기고, 새 기기 로그인이 기존 기기를 끊지 않게 됨                                                                |
| 대안 | login 시 기존 active RT 전체 revoke는 정책이 단순하지만, SSE 다중 기기 동기화 목표와 충돌하여 새 기기 로그인이 기존 기기를 끊으면 안 된다고 판단하여 기기별 RT chain 유지를 선택 |

Phase 2 이후 다음 요구사항은 타이머 SSE 도입에 따른 다중 기기였다. 새 로그인이 들어올 때마다 기존 active refresh token을 모두 정리하면 정책은 단순하지만, 사용자가 PC에서 로그인한 뒤
모바일에서 다시 로그인할 때 PC가 의도치 않게 로그아웃될 수 있다.

FlowMate는 같은 회원의 여러 탭과 기기에 타이머 상태를 SSE로 동기화하는 방향이었기에 "새 기기 로그인 = 기존 기기 종료"는 자연스럽지 않았다.

이에 따라 정책이 다음과 같이 바뀌었다.

- login은 기존 active refresh token을 유지한다.
- 새 로그인에는 새 refresh token을 추가 발급한다.
- refresh 성공 시 현재 refresh token만 revoke한다.
- refresh 성공 후 새 refresh token을 발급하고 cookie를 교체한다.

정상 흐름은 이렇게 된다.

```text
기기 A: RT-A1로 /api/auth/refresh
서버:  RT-A1 revoke
서버:  RT-A2 발급 + cookie 교체

기기 B: RT-B1로 /api/auth/refresh
서버:  RT-B1 revoke
서버:  RT-B2 발급 + cookie 교체
```

각 기기는 자신만의 refresh token chain을 가진다. Refresh Token Rotation은 장기 refresh token 하나가 계속 재사용되는 기간을 줄이고, 폐기된 token이 나중에 다시
들어왔을 때 이상 신호로 볼 수 있다.

## 6. Phase 4: RTR 이후 revoke 정책 안정화

| 구분 | 내용                                                                |
|----|-------------------------------------------------------------------|
| 요구 | 다중 기기 로그인과 RTR을 유지하면서, login/refresh/logout/reuse 상황의 폐기 의미를 분리   |
| 결정 | login은 기존 active RT를 유지하고, revoked RT 재사용에서만 active RT 전체를 revoke |
| 결과 | 새 기기 로그인이 기존 기기를 끊지 않고, 폐기된 token 재사용은 탈취 의심 신호로 처리               |

Phase 3에서 다중 기기 세션과 RTR 기반이 들어왔지만, 그것만으로 모든 revoke 정책이 설명되지 않았다.

특히 새 로그인이 기존 세션을 끊는 경로와, 이미 폐기된 token이 다시 들어오는 경로는 다르게 다뤄야 했다.

[RefreshToken.java](../../backend/src/main/java/kr/io/flowmate/auth/domain/RefreshToken.java)는 refresh token 상태를 유효 여부와
폐기된 token 재사용 여부로 나눠 표현했다.

```text
isValid(): revokedAt == null && expiresAt > now
isStolenReuse(): revokedAt != null
revoke(): revokedAt = now
```

현재 revoke 정책은 경로별로 나뉜다.

| 경로             | 현재 revoke 정책                | 의미          |
|----------------|-----------------------------|-------------|
| login          | 기존 active RT 유지, 새 RT 추가 발급 | 다중 기기 세션 허용 |
| refresh 성공     | 현재 RT revoke, 새 RT 발급       | RTR 정상 회전   |
| revoked RT 재사용 | active RT 전체 revoke         | 탈취 의심 대응    |
| logout         | 현재 cookie의 RT만 revoke       | 현재 세션 종료    |

## 7. 현재 인증 흐름

현재 FlowMate의 인증 흐름은 다섯 가지 경로로 구성된다.

### Guest start

```text
1. 클라이언트가 POST /api/auth/guest/token을 호출한다.
2. 서버는 role=guest, sub=clientId인 Guest JWT를 발급한다.
3. 클라이언트는 Guest JWT를 localStorage에 저장한다.
4. 이후 API 요청은 Authorization: Bearer {guestToken} 헤더로 사용자를 식별한다.
```

Guest JWT는 `X-Client-Id`를 대체하는 로그인 전 식별 수단이다. 브라우저가 보낸 UUID 문자열 대신, 서버가 서명한 JWT로 게스트 범위를 표현한다.

### OAuth login

```text
1. 클라이언트가 OAuth 시작을 요청한다.
2. 서버는 State JWT와 Kakao OAuth URL을 반환한다.
3. 클라이언트는 State JWT를 sessionStorage에 저장하고 Kakao로 이동한다.
4. Kakao callback에서 code와 state를 받는다.
5. 클라이언트는 URL state와 sessionStorage state를 비교하고 state를 삭제한다.
6. 서버는 state JWT를 검증하고 Kakao token/userInfo를 교환한다.
7. 서버는 member access token과 refresh token을 발급한다.
8. access token은 JSON body로, refresh token은 HttpOnly cookie로 전달된다.
```

로그인 시 서버는 기존 active refresh token을 유지하고, 새 refresh token hash를 저장한 뒤 새 cookie를 내려준다.

### Refresh

```text
1. 클라이언트가 POST /api/auth/refresh를 호출한다.
2. refresh token cookie가 자동 전송된다.
3. 서버는 refresh token hash를 조회한다.
4. token이 유효하면 요청에 사용된 refresh token을 revoke한다.
5. 서버는 새 refresh token hash를 저장하고 cookie를 교체한다.
6. 서버는 새 access token과 user 정보를 JSON body로 반환한다.
```

4단계에서 사용된 refresh token을 즉시 revoke하는 것이 RTR의 핵심이다. 이미 폐기된 token이 다시 들어오면 탈취로 판단해 해당 사용자의 active refresh token 전체를
revoke한다.

### Page load 복원 (silent refresh)

Access Token은 브라우저 메모리에만 저장되므로 새로고침하면 사라진다. [authStore.ts](../../frontend/src/store/authStore.ts)의 `init()`이 앱 마운트 시 아래
흐름으로 자동 복원한다.

```text
1. localStorage의 authMode 힌트를 확인한다.
2. 힌트가 'member'이면 POST /api/auth/refresh를 자동 호출한다.
3. 성공하면 새 Access Token과 user 정보를 memory state에 채운다.
4. 실패하면 힌트를 제거하고 게스트 상태로 폴백한다.
5. 힌트가 없으면 refresh 호출을 건너뛰고 게스트 토큰을 사용한다.
```

### Logout

```text
1. 클라이언트가 POST /api/auth/logout을 호출한다.
2. refresh token cookie가 있으면 자동 전송된다.
3. 서버는 cookie가 있으면 refresh token hash를 조회한다.
4. 조회된 refresh token이 있으면 해당 token만 revoke한다.
5. 서버는 refresh token cookie를 제거한다.
6. 서버는 204 No Content를 반환한다.
```

logout은 현재 세션을 종료한다. 서버 logout 이후 프론트엔드는 새 Guest JWT를 발급해 guest 상태로 전환한다.

## 8. 설계 결정별 트레이드오프

| 결정                            | 얻은 것                               | 감수한 비용                        | 현재 판단                                                                                |
|-------------------------------|------------------------------------|-------------------------------|--------------------------------------------------------------------------------------|
| Access Token memory 저장        | 장기 보관 token의 XSS 노출 위험 완화          | 새로고침 시 access token 소실        | refresh API로 복구하므로 수용 가능                                                             |
| Refresh Token HttpOnly cookie | JavaScript 직접 접근 차단                | CSRF, SameSite, Path 설정 고려 필요 | SameSite=Lax (Strict는 OAuth callback 리다이렉트까지 차단), Path=/api/auth 제한으로 완화             |
| DB hash 저장                    | DB 유출 시 refresh token 원문 재사용 위험 완화 | refresh 요청마다 hash 조회 필요       | 조회 비용보다 보안 이점이 크다. Redis 도입 시 개선 가능                                                  |
| RTR                           | 하나의 refresh token이 오래 살아남는 위험 축소   | 클라이언트 refresh 동시성 관리 필요       | singleton refresh promise와 함께 사용. 네트워크 지연 오탐 방지를 위한 Grace Period(5~10초) 추가로 추후 개선 가능 |
| Reuse Detection               | 폐기된 token 재사용을 침해 의심 신호로 활용        | 지연 요청에 대한 오탐 가능성              | 오탐 위험보다 탈취 피해가 크다고 판단해 보수적으로 선택                                                      |
| State JWT                     | 서버 저장소 없이 OAuth callback CSRF 방어   | 서버 측 즉시 revoke/1회 사용 추적 없음    | 짧은 TTL과 callback 후 삭제로 현재 요구 충족                                                      |

## 9. 회고

### 인증 시스템을 단계적으로 발전시켜 복잡도를 감당할 수 있었다.

처음부터 OAuth, JWT, HttpOnly cookie, RTR, 다중 기기 세션, Reuse Detection을 모두 갖춘 인증 시스템을 만들려고 했다면 높은 복잡도로 시작도 못했을 것이다.

그러나 백엔드 없는 MVP, `X-Client-Id`, Guest JWT, member login, RTR 순서로 단계를 나눠 진행하면서 각 단계에서 무엇이 부족하고 어떤 위험이
생기는지 확인할 수 있었다. 처음부터 100점을 목표로 하지 않았기에 오히려 각 선택의 필요성과 한계를 더 명확하게 파악할 수 있었다.

### 스프링 시큐리티를 사용하지 않고 직접 구현한 것은 학습엔 도움이 되었지만, 운영적인 관점에선 도입을 검토해야 한다.

Spring Security 라이브러리를 처음부터 붙였다면 내부적으로 어떻게 동작하는지 원리를 이해하기 어려웠을 것이다.
직접 state를 만들고, Kakao code를 교환하고, access token과 refresh token의 저장 위치를 나누고, RTR과 Reuse Detection을 구현하면서 각 단계가 왜 필요한지 더
구체적으로 이해할 수 있었다.

다만, 대부분 라이브러리를 통해 구현하므로 추후에 라이브러리를 도입하는 리팩토링도 진행하는 것이 좋겠다.

### Redis 도입 시 인증 구조 개선 가능

현재 Refresh Token은 MySQL `auth_refresh_tokens` 테이블에 저장한다. 토큰 조회가 refresh 요청마다 발생하고, 만료된 토큰은 별도 배치 삭제가 필요하다. Redis TTL 기반으로 이전하면 만료를 자동으로 처리하고 DB 부하를 줄일 수 있다.

State JWT도 개선 여지가 있다. 현재는 Stateless JWT라 서버가 state를 저장하지 않아 1회 사용 보장과 즉시 무효화가 불가능하다. Redis에 state를 단기 저장(5분 TTL)하고 OAuth callback 후 즉시 삭제하면 1회 사용을 보장할 수 있다. Refresh Token 이전과 함께 묶어서 처리할 수 있는 작업이다.
