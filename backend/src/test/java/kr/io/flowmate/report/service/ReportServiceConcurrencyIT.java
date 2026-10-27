package kr.io.flowmate.report.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import kr.io.flowmate.report.config.ReportGuardProperties;
import kr.io.flowmate.report.domain.ReportContent;
import kr.io.flowmate.report.domain.ReportType;
import kr.io.flowmate.report.dto.response.ReportResponse;
import kr.io.flowmate.report.exception.ReportGenerationInProgressException;
import kr.io.flowmate.report.exception.ReportRateLimitedException;
import kr.io.flowmate.report.prompt.TodoFixtures;
import kr.io.flowmate.report.repository.ReportRepository;
import kr.io.flowmate.review.repository.ReviewRepository;
import kr.io.flowmate.todo.repository.TodoRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 실제 Redis lock으로 같은 리포트 동시 생성 요청이 Gemini를 한 번만 부르는지 확인한다 */
@DisplayName("ReportService 동시 생성 (Redis IT)")
class ReportServiceConcurrencyIT {

    private static final String USER = "user-1";
    private static final LocalDate DAY = LocalDate.parse("2026-10-20");
    private static final int REQUESTS = 10;
    private static final Duration COOLDOWN = Duration.ofMillis(500);

    private ReportRedisSupport.Connected redis;
    private final AtomicInteger geminiCalls = new AtomicInteger();
    private volatile CountDownLatch othersRejected;
    private ReportService service;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        redis = ReportRedisSupport.connect();
        redis.flush();
        othersRejected = new CountDownLatch(0);
        service = newService(redis);
        pool = Executors.newFixedThreadPool(REQUESTS);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
        redis.close();
    }

    @Test
    @DisplayName("같은 key 동시 요청 10건 → Gemini 1회, 나머지 9건은 409")
    void parallelSameKey_callsGeminiOnce() throws Exception {
        List<Outcome> outcomes = runInParallel(REQUESTS);

        assertThat(geminiCalls.get()).isEqualTo(1);
        assertThat(outcomes).filteredOn(o -> o == Outcome.OK).hasSize(1);
        assertThat(outcomes).filteredOn(o -> o == Outcome.IN_PROGRESS).hasSize(REQUESTS - 1);
    }

    @Test
    @DisplayName("409로 거절된 요청은 사용자 한도를 쓰지 않는다")
    void rejectedRequests_doNotConsumeUserLimit() throws Exception {
        runInParallel(REQUESTS);

        assertThat(redis.template().opsForValue().get("report:rate:" + USER)).isEqualTo("1");
    }

    @Test
    @DisplayName("다시 생성: cooldown 중에는 429, cooldown이 지나면 기존 row가 있어도 Gemini를 다시 부른다")
    void regenerate_afterCooldown_callsGeminiAgain() throws Exception {
        runInParallel(REQUESTS);

        assertThatThrownBy(() -> service.generate(USER, ReportType.DAILY, DAY))
            .isInstanceOf(ReportRateLimitedException.class);
        Thread.sleep(COOLDOWN.toMillis() + 200);
        service.generate(USER, ReportType.DAILY, DAY);

        assertThat(geminiCalls.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("Redis 장애 시 fail-open: lock 없이 Gemini를 호출해 응답한다")
    void redisDown_failOpen() {
        try (ReportRedisSupport.Connected down = ReportRedisSupport.unreachable()) {
            ReportService downService = newService(down);

            ReportResponse resp = downService.generate(USER, ReportType.DAILY, DAY);

            assertThat(resp.keep()).isEqualTo("k");
            assertThat(geminiCalls.get()).isEqualTo(1);
        }
    }

    private List<Outcome> runInParallel(int n) throws Exception {
        othersRejected = new CountDownLatch(n - 1);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Outcome>> futures = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            futures.add(pool.submit(() -> {
                start.await();
                try {
                    service.generate(USER, ReportType.DAILY, DAY);
                    return Outcome.OK;
                } catch (ReportGenerationInProgressException e) {
                    othersRejected.countDown();
                    return Outcome.IN_PROGRESS;
                }
            }));
        }
        start.countDown();
        List<Outcome> outcomes = new ArrayList<>();
        for (Future<Outcome> f : futures) {
            outcomes.add(f.get(10, TimeUnit.SECONDS));
        }
        return outcomes;
    }

    private ReportService newService(ReportRedisSupport.Connected connected) {
        TodoRepository todoRepo = mock(TodoRepository.class);
        when(todoRepo.findAllByUserIdAndDateBetweenOrderByDateAscMiniDayAscDayOrderAscCreatedAtAsc(anyString(), any(), any()))
            .thenReturn(List.of(TodoFixtures.completed("x", 60, 1)));

        // stub generator: 첫 호출은 나머지 요청이 모두 409를 받을 때까지 붙잡아 lock 경합을 확실히 만든다
        AiReportGenerator generator = mock(AiReportGenerator.class);
        when(generator.generate(any(), any(), any())).thenAnswer(inv -> {
            geminiCalls.incrementAndGet();
            othersRejected.await(5, TimeUnit.SECONDS);
            return new AiReportGenerator.Result(new ReportContent("k", "p", "t", null), "daily.v2");
        });

        ReportPersistence persistence = mock(ReportPersistence.class);
        when(persistence.upsertAndFetch(any(), any(), any(), any())).thenReturn(
            new ReportResponse("r1", "DAILY", DAY, "k", "p", "t", null, "daily.v2", Instant.now()));

        ReportGuardProperties props = new ReportGuardProperties();
        props.setCooldown(COOLDOWN);
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        ReportGenerationLock lock = new ReportGenerationLock(connected.template(), props, meterRegistry);
        ReportRateLimiter rateLimiter = new ReportRateLimiter(connected.template(), props, meterRegistry);
        return new ReportService(mock(ReportRepository.class), todoRepo, mock(ReviewRepository.class),
            generator, persistence, lock, rateLimiter);
    }

    private enum Outcome { OK, IN_PROGRESS }
}
