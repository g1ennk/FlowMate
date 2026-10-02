package kr.io.flowmate.timer.service;

import kr.io.flowmate.session.dto.request.SessionCreateRequest;
import kr.io.flowmate.session.service.SessionService;
import kr.io.flowmate.timer.domain.TimerState;
import kr.io.flowmate.timer.dto.request.TimerStatePushRequest;
import kr.io.flowmate.timer.dto.response.TimerStateResponse;
import kr.io.flowmate.timer.repository.TimerStateRepository;
import kr.io.flowmate.todo.domain.Todo;
import kr.io.flowmate.todo.service.TodoService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 같은 Todo에 대한 동시 타이머 저장과, 다른 쓰기 경로(세션 생성·Todo 삭제·활성 조회)와의 경합을
 * 실제 MySQL 8.0에서 검증한다. 모든 시나리오는 CyclicBarrier로 동시에 출발시키는 최악 조건이다.
 */
class TimerStateConcurrencyIT extends TimerIntegrationTest {

    private static final int ROUNDS = 30;
    private static final int WRITERS = 4;
    private static final String RUNNING_JSON = "{\"status\":\"running\"}";

    private static ExecutorService executor;

    @Autowired
    private TimerService timerService;

    @Autowired
    private TimerStateRepository timerStateRepository;

    @Autowired
    private TodoService todoService;

    @Autowired
    private SessionService sessionService;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeAll
    static void startExecutor() {
        executor = Executors.newFixedThreadPool(8);
    }

    @AfterAll
    static void stopExecutor() {
        executor.shutdownNow();
    }

    @Test
    void 같은_Todo_동시_첫_저장은_모두_성공하고_version이_1부터_순서대로_매겨진다() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);

            List<Attempt> attempts = runTogether(pushTasks(userId, todoId, WRITERS, this::running));

            assertThat(failures(attempts)).as("round %d", round).isEmpty();
            assertThat(versions(attempts)).as("round %d", round).containsExactlyInAnyOrder(1L, 2L, 3L, 4L);
        }
    }

    @Test
    void 기존_행_동시_갱신은_version이_연속으로_증가하고_DB는_최대_version_쓰기의_상태를_가진다() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);
            long base = timerService.upsertState(userId, todoId, running(-1)).version();

            List<Attempt> attempts = runTogether(pushTasks(userId, todoId, WRITERS, this::running));

            assertThat(failures(attempts)).as("round %d", round).isEmpty();
            assertThat(versions(attempts)).as("round %d", round)
                    .containsExactlyInAnyOrderElementsOf(range(base + 1, base + WRITERS));
            TimerState saved = timerStateRepository.findById(todoId).orElseThrow();
            assertThat(saved.getVersion()).as("round %d", round).isEqualTo(base + WRITERS);
            assertThat(saved.getStateJson()).as("round %d", round)
                    .contains("\"writer\":" + latest(attempts).index());
        }
    }

    @Test
    void idle과_running이_섞인_동시_갱신에서도_DB는_최대_version_쓰기의_상태를_가진다() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);
            long base = timerService.upsertState(userId, todoId, running(-1)).version();

            List<Attempt> attempts = runTogether(
                    pushTasks(userId, todoId, WRITERS, writer -> writer % 2 == 0 ? idle() : running(writer)));

            assertThat(failures(attempts)).as("round %d", round).isEmpty();
            assertThat(versions(attempts)).as("round %d", round)
                    .containsExactlyInAnyOrderElementsOf(range(base + 1, base + WRITERS));
            int latestWriter = latest(attempts).index();
            String stateJson = timerStateRepository.findById(todoId).orElseThrow().getStateJson();
            if (latestWriter % 2 == 0) {
                assertThat(stateJson).as("round %d, latest idle writer %d", round, latestWriter).isNull();
            } else {
                assertThat(stateJson).as("round %d", round).contains("\"writer\":" + latestWriter);
            }
        }
    }

    @Test
    void 세션_생성과_동시에_저장해도_모두_성공하고_세션_집계가_정확하다() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);
            long base = timerService.upsertState(userId, todoId, running(-1)).version();

            List<Callable<Long>> tasks = new ArrayList<>(pushTasks(userId, todoId, 2, this::running));
            tasks.add(() -> {
                sessionService.createSession(userId, todoId, session(60));
                return null;
            });
            tasks.add(() -> {
                sessionService.createSession(userId, todoId, session(60));
                return null;
            });
            List<Attempt> attempts = runTogether(tasks);

            assertThat(failures(attempts)).as("round %d", round).isEmpty();
            Todo todo = todoRepository.findById(todoId).orElseThrow();
            assertThat(todo.getSessionCount()).as("round %d", round).isEqualTo(2);
            assertThat(todo.getSessionFocusSeconds()).as("round %d", round).isEqualTo(120);
            assertThat(timerStateRepository.findById(todoId).orElseThrow().getVersion())
                    .as("round %d", round).isEqualTo(base + 2);
        }
    }

    @Test
    void Todo_삭제와_동시에_저장하면_결과는_성공_또는_404뿐이고_고아_행과_유령_이벤트가_없다() throws Exception {
        long totalSaved = 0;
        long totalNotFound = 0;
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);
            timerService.upsertState(userId, todoId, running(-1));
            clearInvocations(sseBroadcaster);

            List<Callable<Long>> tasks = new ArrayList<>(pushTasks(userId, todoId, 3, this::running));
            tasks.add(() -> {
                todoService.deleteTodo(userId, todoId);
                return null;
            });
            List<Attempt> attempts = runTogether(tasks);

            assertThat(failures(attempts)).as("round %d", round).allMatch("TodoNotFoundException"::equals);
            long savedPushes = attempts.stream().filter(attempt -> attempt.version() != null).count();
            assertThat(timerRowCount(todoId)).as("round %d", round).isZero();
            verify(sseBroadcaster, times((int) savedPushes)).onTimerStateChanged(any());
            totalSaved += savedPushes;
            totalNotFound += failures(attempts).size();
        }
        // 404 경로가 실제로 관측됐는지 기록한다. 순서는 강제하지 않으므로 0이어도 실패로 보지 않는다
        System.out.printf("[delete race] pushes=%d saved=%d notFound=%d%n",
                ROUNDS * 3, totalSaved, totalNotFound);
    }

    @Test
    void 오래된_타이머를_다시_시작하는_동안_활성_조회가_와도_행이_유지되고_다시_복원된다() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            String userId = newUser();
            String todoId = newTodo(userId);
            Instant expired = Instant.now().minus(25, ChronoUnit.HOURS).truncatedTo(ChronoUnit.MILLIS);
            new TransactionTemplate(transactionManager).executeWithoutResult(status ->
                    timerStateRepository.upsert(todoId, userId, RUNNING_JSON, expired)); // version 1, 25시간 전 갱신
            assertThat(timerService.getActiveStates(userId)).as("round %d 만료 직후", round).isEmpty();

            List<Callable<Long>> tasks = new ArrayList<>(pushTasks(userId, todoId, 2, this::running));
            tasks.add(() -> {
                timerService.getActiveStates(userId);
                return null;
            });
            List<Attempt> attempts = runTogether(tasks);

            assertThat(failures(attempts)).as("round %d", round).isEmpty();
            assertThat(versions(attempts)).as("round %d", round).containsExactlyInAnyOrder(2L, 3L);
            assertThat(timerRowCount(todoId)).as("round %d", round).isEqualTo(1);
            assertThat(timerService.getActiveStates(userId)).as("round %d 재시작 후", round)
                    .extracting(TimerStateResponse::todoId)
                    .containsExactly(todoId);
        }
    }

    /** push 작업을 먼저 넣으므로 push의 index는 writer 번호와 같다. */
    private record Attempt(int index, Long version, Throwable error) {
    }

    private List<Callable<Long>> pushTasks(String userId, String todoId, int count,
                                           IntFunction<TimerStatePushRequest> request) {
        List<Callable<Long>> tasks = new ArrayList<>();
        for (int writer = 0; writer < count; writer++) {
            TimerStatePushRequest body = request.apply(writer);
            tasks.add(() -> timerService.upsertState(userId, todoId, body).version());
        }
        return tasks;
    }

    private List<Attempt> runTogether(List<Callable<Long>> tasks) throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(tasks.size());
        List<Future<Attempt>> futures = new ArrayList<>();
        for (int i = 0; i < tasks.size(); i++) {
            int index = i;
            Callable<Long> task = tasks.get(i);
            futures.add(executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    return new Attempt(index, task.call(), null);
                } catch (Exception e) {
                    return new Attempt(index, null, e);
                }
            }));
        }
        List<Attempt> attempts = new ArrayList<>();
        for (Future<Attempt> future : futures) {
            attempts.add(future.get(60, TimeUnit.SECONDS));
        }
        return attempts;
    }

    private static List<String> failures(List<Attempt> attempts) {
        return attempts.stream()
                .filter(attempt -> attempt.error() != null)
                .map(attempt -> classify(attempt.error()))
                .toList();
    }

    private static List<Long> versions(List<Attempt> attempts) {
        return attempts.stream()
                .map(Attempt::version)
                .filter(version -> version != null)
                .toList();
    }

    private static Attempt latest(List<Attempt> attempts) {
        return attempts.stream()
                .filter(attempt -> attempt.version() != null)
                .max(Comparator.comparingLong(Attempt::version))
                .orElseThrow();
    }

    private static List<Long> range(long from, long to) {
        return LongStream.rangeClosed(from, to).boxed().toList();
    }

    private TimerStatePushRequest running(int writer) {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("running");
        request.setState(Map.of("status", "running", "writer", writer));
        return request;
    }

    private TimerStatePushRequest idle() {
        TimerStatePushRequest request = new TimerStatePushRequest();
        request.setStatus("idle");
        request.setState(null);
        return request;
    }

    private static SessionCreateRequest session(int focusSeconds) {
        SessionCreateRequest request = new SessionCreateRequest();
        request.setSessionFocusSeconds(focusSeconds);
        request.setClientSessionId(UUID.randomUUID().toString());
        return request;
    }
}
