import { Report } from '../report.entity';

export class ReportResponseDto {
  id: string;
  type: string;
  periodStart: string;
  // kpt 평탄화로 클라이언트가 content 중첩 없이 바로 접근 가능
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
      // undefined → null 변환: JSON 응답에서 키가 누락되지 않도록 명시적으로 null 처리(optional)
      referenceQuestion: report.content.referenceQuestion ?? null,
      promptVersion: report.promptVersion,
      createdAt: report.createdAt.toISOString(),
    };
  }
}
