import { IsDateString, IsIn, IsNotEmpty } from 'class-validator';
import { REPORT_TYPES, type ReportType } from '../report.entity';

export class ReportQueryDto {
  @IsIn(REPORT_TYPES)
  type: ReportType;

  @IsNotEmpty()
  // 빈 문자열이 IsDateString을 통과하는 것을 방지하기 위해 IsNotEmpty 병행 사용
  @IsDateString()
  periodStart: string;
}
