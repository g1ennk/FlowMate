import { Report } from '../report.entity';

export class ReportResponseDto {
  id: string;
  type: string;
  periodStart: string;
  keep: string;
  problem: string;
  try: string;
  referenceQuestion: string | null;
  promptVersion: string | null;
  createdAt: string;

  static from(report: Report): ReportResponseDto {
    return {
      id: report.id,
      type: report.type,
      periodStart: report.periodStart,
      keep: report.content.keep,
      problem: report.content.problem,
      try: report.content.try,
      referenceQuestion: report.content.referenceQuestion ?? null,
      promptVersion: report.promptVersion,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
