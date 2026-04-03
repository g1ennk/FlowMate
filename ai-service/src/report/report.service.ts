import { Injectable, BadRequestException } from '@nestjs/common';
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
    const { from, to } = this.periodRange(type, periodStart);
    const [todos, weeklyReviews] = await Promise.all([
      this.flowmateClient.fetchTodos(token, from, to),
      type === 'MONTHLY'
        ? this.flowmateClient.fetchReviews(token, 'WEEKLY', from, to)
        : Promise.resolve(undefined),
    ]);

    if (todos.length === 0) {
      throw new BadRequestException('생성할 데이터가 없습니다');
    }

    const { content, promptVersion } = await this.aiService.generateReport(
      type,
      todos,
      weeklyReviews,
    );

    await this.reportRepo.upsert(
      { userId, type, periodStart, content, promptVersion },
      ['userId', 'type', 'periodStart'],
    );
    const saved = await this.reportRepo.findOneByOrFail({
      userId,
      type,
      periodStart,
    });
    return ReportResponseDto.from(saved);
  }

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
    if (type === 'DAILY') return { from: periodStart, to: periodStart };

    const [y, m, d] = periodStart.split('-').map(Number);
    if (type === 'WEEKLY') {
      const end = new Date(Date.UTC(y, m - 1, d + 6));
      return { from: periodStart, to: end.toISOString().split('T')[0] };
    }
    // MONTHLY — 해당 월 마지막 날
    const end = new Date(Date.UTC(y, m, 0));
    return { from: periodStart, to: end.toISOString().split('T')[0] };
  }
}
