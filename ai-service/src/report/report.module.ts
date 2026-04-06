import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Report } from './report.entity';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { FlowmateClientModule } from '../flowmate-client/flowmate-client.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([Report]), FlowmateClientModule, AiModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
