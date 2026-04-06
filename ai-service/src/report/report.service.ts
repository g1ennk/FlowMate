import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportType } from './report.entity';
import { FlowmateClientService } from '../flowmate-client/flowmate-client.service';
import { AiService } from '../ai/ai.service';
import { ReportResponseDto } from './dto/report-response.dto';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepo: Repository<Report>,
    private readonly flowmateClient: FlowmateClientService,
    private readonly aiService: AiService,
  ) {}

  async generate(
    userId: string,
    type: ReportType,
    periodStart: string,
    token: string,
  ): Promise<ReportResponseDto> {
    // type과 periodStart 기반으로 조회 기간 계산
    const { from, to } = this.periodRange(type, periodStart);

    // todos와 weeklyReviews 병렬 fetch
    // MONTHLY가 아니면 weeklyReviews 불필요하므로 즉시 undefined 반환
    const [todos, weeklyReviews] = await Promise.all([
      this.flowmateClient.fetchTodos(token, from, to),
      type === 'MONTHLY'
        ? this.flowmateClient.fetchReviews(token, 'WEEKLY', from, to)
        : Promise.resolve(undefined),
    ]);

    // todos가 없으면 Gemini 호출 자체를 막음 — AI 비용 낭비 방지
    if (todos.length === 0) {
      throw new BadRequestException('생성할 데이터가 없습니다');
    }

    // Gemini API로 KPT 리포트 생성 — 2~5초 소요
    const { content, promptVersion } = await this.aiService.generateReport(
      type,
      todos,
      weeklyReviews,
    );

    // 동일 userId·type·periodStart 조합이면 덮어씀 — 재생성 지원
    await this.reportRepo.upsert(
      { userId, type, periodStart, content, promptVersion },
      ['userId', 'type', 'periodStart'],
    );

    // upsert 후 재조회 — id·createdAt·updatedAt은 DB가 자동 생성하므로 재조회 필요
    const saved = await this.reportRepo.findOneByOrFail({
      userId,
      type,
      periodStart,
    });
    return ReportResponseDto.from(saved);
  }

  // 저장된 리포트 단건 조회 — 없으면 null 반환 (컨트롤러에서 204 처리)
  async findOne(
    userId: string,
    type: ReportType,
    periodStart: string,
  ): Promise<ReportResponseDto | null> {
    const report = await this.reportRepo.findOneBy({
      userId,
      type,
      periodStart,
    });
    return report ? ReportResponseDto.from(report) : null;
  }

  private periodRange(
    type: ReportType,
    periodStart: string,
  ): { from: string; to: string } {
    // DAILY: from == to (당일 하루)
    if (type === 'DAILY') return { from: periodStart, to: periodStart };

    const [y, m, d] = periodStart.split('-').map(Number);

    // WEEKLY: 해당 주 월요일(from) ~ 월요일 + 6일 일요일(to)
    // Date.UTC 사용으로 타임존 무관하게 계산, JS month는 0-based라 m-1
    if (type === 'WEEKLY') {
      const to = new Date(Date.UTC(y, m - 1, d + 6));
      return { from: periodStart, to: to.toISOString().split('T')[0] };
    }

    // MONTHLY: 해당 월 1일(from) ~ 해당 월 마지막 날(to)
    // Date.UTC(y, m, 0) — 다음 달 0일 = 이번 달 마지막 날 (m은 1-based이므로 그대로 사용)
    const to = new Date(Date.UTC(y, m, 0));
    return { from: periodStart, to: to.toISOString().split('T')[0] };
  }
}
