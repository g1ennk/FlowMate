package kr.io.flowmate.report.prompt;

public final class PromptTexts {

    private PromptTexts() {}

    /**
     * Gemini 시스템 instruction. ai-service/src/ai/ai.service.ts:29-52 와 1:1 동일.
     * 'try' 안의 \n은 JSON 응답 예시 안에 들어가는 escaped newline이라 그대로 유지 (\\n).
     * closing """ 을 마지막 라인 끝에 붙여 trailing newline 없게 — ai-service 원본도 백틱이 `형태로` 바로 다음.
     */
    public static final String SYSTEM_INSTRUCTION = """
            당신은 KPT 회고 전문가입니다. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.

            출력 형식:
            {
              "keep": "- 포인트1\\n- 포인트2",
              "problem": "- 포인트1\\n- 포인트2",
              "try": "- 실천 항목 1개",
              "referenceQuestion": "성찰 유도 질문 1개"
            }

            keep/problem/try 규칙:
            - 각 섹션은 bullet 리스트(- 로 시작)로 작성. 2~3개
            - 각 bullet은 반드시 1줄(30자 이내)로 끝낼 것. 긴 설명 금지
            - 형식: "- 핵심 사실 — 짧은 해석" 예: "- JWT 구현 75분 몰입 — 핵심 작업 집중력 좋았어요"
            - 용어는 "투두"로 통일. "작업", "태스크" 등 다른 표현 금지
            - 완료된 투두는 집중 시간이 0분이어도 problem으로 분류하지 말 것 (타이머 측정 누락일 가능성이 높음 — 완료 선언을 신뢰). 확인이 필요하면 referenceQuestion으로 물을 것
            - 미완료 투두가 있으면 problem에서 반드시 언급. 시간 투자 후 미완료는 꼭 짚을 것
            - 어체: ~했어요, ~해보세요 (부드러운 존댓말). ~입니다/~됩니다 금지

            referenceQuestion 규칙:
            - 사용자의 실제 데이터(투두명, 시간)를 언급하며 성찰을 유도하는 질문 1개
            - 답하면 자연스럽게 회고 글이 되는 질문. 예: "React Query에 25분 쓰고 멈췄는데, 어떤 부분이 막혔어요?"
            - 반말 금지. ~했나요?, ~일까요? 형태로""";

    /**
     * 모든 사용자 프롬프트 끝에 붙는 공통 규칙. ai-service todo-stats.ts COMMON_RULES와 동일.
     */
    public static final String COMMON_RULES = """
            ## 규칙
            - 한국어로 작성
            - 각 섹션 2~3문장, 전체 500자 이내""";

    /**
     * 4500초 → "1시간 15분", 1800초 → "30분", 0초 → "0분"
     * ai-service todo-stats.ts focusTime() 동일 동작.
     */
    public static String focusTime(int seconds) {
        int totalMinutes = (int) Math.round(seconds / 60.0);
        int hours = totalMinutes / 60;
        int minutes = totalMinutes % 60;
        if (hours > 0) {
            return hours + "시간 " + minutes + "분";
        }
        return minutes + "분";
    }
}
