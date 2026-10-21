package kr.io.flowmate.timer.sse;

/**
 * SSE 전달 경로의 Micrometer 지표 이름. Prometheus에서는 점이 밑줄로 바뀌고 counter에 _total이 붙는다.
 * 사용자 수만큼 늘어나는 태그(userId 등)는 붙이지 않는다.
 * <p>
 * 전달 단계마다 지표를 나눈다. publish 성공은 Redis가 받았다는 뜻일 뿐 기기에 닿았다는 뜻이 아니다.
 */
public final class SseMetrics {

    /** Redis 채널 발행 시도. result=success|failure */
    public static final String PUBLISH = "flowmate.sse.publish";

    /** fan-out 대기 큐에 쌓인 작업 수 */
    public static final String DISPATCH_QUEUE_SIZE = "flowmate.sse.dispatch.queue.size";

    /** fan-out 대기 큐의 남은 칸 */
    public static final String DISPATCH_QUEUE_REMAINING = "flowmate.sse.dispatch.queue.remaining";

    /** 큐와 스레드가 모두 차서 버린 fan-out 작업 수 */
    public static final String DISPATCH_DROPPED = "flowmate.sse.dispatch.dropped";

    /** 연결(emitter) 단위 timer-state 전송. result=success|failure */
    public static final String FANOUT = "flowmate.sse.fanout";

    /** 이 서버가 들고 있는 SSE 연결 수 */
    public static final String CONNECTIONS = "flowmate.sse.connections";

    /** Redis 구독 시도 실패 수. 재시도마다 1씩 오른다 */
    public static final String SUBSCRIBER_FAILURES = "flowmate.sse.subscriber.failures";

    /** Redis 구독 상태. 1이면 구독 중, 0이면 끊김 */
    public static final String SUBSCRIBER_LISTENING = "flowmate.sse.subscriber.listening";

    public static final String RESULT = "result";
    public static final String SUCCESS = "success";
    public static final String FAILURE = "failure";

    private SseMetrics() {
    }
}
