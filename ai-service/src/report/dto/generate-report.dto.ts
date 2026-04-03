import { IsIn, IsNotEmpty, Matches } from 'class-validator';
import { REPORT_TYPES, type ReportType } from '../report.entity';

export class ReportQueryDto {
  @IsIn(REPORT_TYPES)
  type: ReportType;

  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'periodStart must be yyyy-MM-dd format',
  })
  periodStart: string;
}
