import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportService } from './report.service';
import { ReportQueryDto } from './dto/generate-report.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post('generate')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() dto: ReportQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException();
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
    if (!report) {
      res.status(204);
      return;
    }
    return report;
  }
}
