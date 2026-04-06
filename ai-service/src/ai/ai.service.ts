import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { ReportContent, ReportType } from '../report/report.entity';
import type {
  FlowmateReview,
  FlowmateTodo,
} from '../flowmate-client/flowmate-client.service';
import { buildDailyPrompt, DAILY_PROMPT_VERSION } from './prompts/daily.v2';
import { buildWeeklyPrompt, WEEKLY_PROMPT_VERSION } from './prompts/weekly.v2';
import {
  buildMonthlyPrompt,
  MONTHLY_PROMPT_VERSION,
} from './prompts/monthly.v2';

interface GenerateResult {
  content: ReportContent;
  promptVersion: string;
}

@Injectable()
export class AiService {
  // KPT 전문가 역할 + 출력 포맷 규칙 — 어체, bullet 형식, referenceQuestion 규칙 포함
  private static readonly SYSTEM_INSTRUCTION = `\
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
- "완료했지만 집중 시간 0분"과 "미완료"를 구분하여 다른 문제로 다룰 것
- 미완료 투두가 있으면 problem에서 반드시 언급. 시간 투자 후 미완료는 꼭 짚을 것
- 어체: ~했어요, ~해보세요 (부드러운 존댓말). ~입니다/~됩니다 금지

referenceQuestion 규칙:
- 사용자의 실제 데이터(투두명, 시간)를 언급하며 성찰을 유도하는 질문 1개
- 답하면 자연스럽게 회고 글이 되는 질문. 예: "React Query에 25분 쓰고 멈췄는데, 어떤 부분이 막혔어요?"
- 반말 금지. ~했나요?, ~일까요? 형태로`;

  private readonly client: GoogleGenAI;
  private readonly logger = new Logger(AiService.name);

  constructor(config: ConfigService) {
    this.client = new GoogleGenAI({
      apiKey: config.getOrThrow('GEMINI_API_KEY'),
    });
  }

  async generateReport(
    type: ReportType,
    todos: FlowmateTodo[],
    weeklyReviews?: FlowmateReview[],
  ): Promise<GenerateResult> {
    const { prompt, version } = this.buildPrompt(type, todos, weeklyReviews);

    try {
      const startTime = Date.now();
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        config: {
          responseMimeType: 'application/json',
          systemInstruction: AiService.SYSTEM_INSTRUCTION,
        },
        contents: prompt,
      });

      this.logger.log(
        `Gemini API call: ${Date.now() - startTime}ms, type=${type}`,
      );

      const text = response.text?.trim();
      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      let parsed: ReportContent;
      try {
        parsed = JSON.parse(text) as ReportContent;
      } catch {
        // Gemini가 마크다운 코드블록으로 감싸서 줄 경우 대비 regex fallback
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error(`Failed to parse JSON from response: ${text}`);
        }
        parsed = JSON.parse(jsonMatch[0]) as ReportContent;
      }

      if (!parsed.keep || !parsed.problem || !parsed.try) {
        throw new Error(`Incomplete report fields: ${JSON.stringify(parsed)}`);
      }

      return { content: parsed, promptVersion: version };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error(`Gemini API error: ${error}`, (error as Error).stack);

      if ((error as { status?: number }).status === 429) {
        throw new HttpException(
          'AI 서비스가 일시적으로 사용량이 초과되었습니다',
          429,
        );
      }

      throw new InternalServerErrorException('AI report generation failed');
    }
  }

  private buildPrompt(
    type: ReportType,
    todos: FlowmateTodo[],
    weeklyReviews?: FlowmateReview[],
  ) {
    switch (type) {
      case 'DAILY':
        return {
          prompt: buildDailyPrompt(todos),
          version: DAILY_PROMPT_VERSION,
        };
      case 'WEEKLY':
        return {
          prompt: buildWeeklyPrompt(todos),
          version: WEEKLY_PROMPT_VERSION,
        };
      case 'MONTHLY':
        return {
          prompt: buildMonthlyPrompt(todos, weeklyReviews),
          version: MONTHLY_PROMPT_VERSION,
        };
    }
  }
}
