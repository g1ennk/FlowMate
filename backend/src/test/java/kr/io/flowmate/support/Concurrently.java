package kr.io.flowmate.support;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * 동시성 통합 테스트용 실행기. 작업들을 CyclicBarrier로 동시에 출발시키고, 성공 값과 예외를 그대로 모은다.
 */
public final class Concurrently {

    private Concurrently() {
    }

    /** 작업 하나의 결과. 성공하면 value, 실패하면 error가 채워진다. */
    public record Outcome<T>(int index, T value, Throwable error) {

        public boolean failed() {
            return error != null;
        }
    }

    public static <T> List<Outcome<T>> run(ExecutorService executor, List<Callable<T>> tasks) throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(tasks.size());
        List<Future<Outcome<T>>> futures = new ArrayList<>();
        for (int i = 0; i < tasks.size(); i++) {
            int index = i;
            Callable<T> task = tasks.get(i);
            futures.add(executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    return new Outcome<>(index, task.call(), null);
                } catch (Exception e) {
                    return new Outcome<>(index, null, e);
                }
            }));
        }
        List<Outcome<T>> outcomes = new ArrayList<>();
        for (Future<Outcome<T>> future : futures) {
            outcomes.add(future.get(60, TimeUnit.SECONDS));
        }
        return outcomes;
    }

    public static <T> List<String> failures(List<Outcome<T>> outcomes) {
        return outcomes.stream()
                .filter(Outcome::failed)
                .map(outcome -> classify(outcome.error()))
                .toList();
    }

    public static <T> List<T> values(List<Outcome<T>> outcomes) {
        return outcomes.stream()
                .filter(outcome -> !outcome.failed())
                .map(Outcome::value)
                .toList();
    }

    /** 실패 원인을 MySQL 오류 코드 기준으로 분류한다. SQL 오류가 아니면 예외 클래스 이름. */
    public static String classify(Throwable e) {
        for (Throwable cause = e; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) {
                return switch (sql.getErrorCode()) {
                    case 1213 -> "DEADLOCK(1213)";
                    case 1205 -> "LOCK_WAIT_TIMEOUT(1205)";
                    case 1062 -> "DUPLICATE_KEY(1062)";
                    default -> "SQL(" + sql.getErrorCode() + ")";
                };
            }
        }
        return e.getClass().getSimpleName();
    }
}
