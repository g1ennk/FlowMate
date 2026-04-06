import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BearerToken } from '../common/decorators/bearer-token.decorator';
import { ReportService } from './report.service';
import { ReportQueryDto } from './dto/generate-report.dto';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.interface';

@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('generate')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() dto: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
    @BearerToken() token: string,
  ) {
    return this.reportService.generate(
      req.user.userId,
      dto.type,
      dto.periodStart,
      token,
    );
  }

  @Get()
  async findOne(
    @Query() dto: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const report = await this.reportService.findOne(
      req.user.userId,
      dto.type,
      dto.periodStart,
    );
    // 리포트 미존재 시 204 반환 — 클라이언트가 생성 여부를 판단하도록
    if (!report) {
      res.status(204);
      return;
    }
    return report;
  }
}
