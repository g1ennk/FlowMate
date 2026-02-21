package kr.io.flowmate.settings.domain;

/**
 * 하루를 나누는 시간대를 표현하는 불변 객체
 * - label: 시간대 이름 (예: 오전, 오후, 저녁)
 * - startMin: 시작 시간 (분 단위, 0-1440)
 * - endMin: 종료 시간 (분 단위, 0-1440)
 */
public record MiniDay(String label, int startMin, int endMin) {

    public MiniDay {
        String normalizedLabel = label == null ? null : label.trim();
        if (normalizedLabel == null || normalizedLabel.isEmpty()) {
            throw new IllegalArgumentException("Label cannot be empty");
        }
        if (normalizedLabel.length() > 50) {
            throw new IllegalArgumentException("Label cannot exceed 50 characters");
        }
        if (startMin < 0 || startMin > 1440) {
            throw new IllegalArgumentException("Start minutes must be 0-1440");
        }
        if (endMin < 0 || endMin > 1440) {
            throw new IllegalArgumentException("End minutes must be 0-1440");
        }
        if (startMin >= endMin) {
            throw new IllegalArgumentException("Start time must be before end time");
        }

        label = normalizedLabel;
    }
}
