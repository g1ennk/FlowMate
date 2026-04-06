import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

@Controller('health')
@SkipThrottle() // 모니터링 도구의 주기적 호출을 고려해 Rate Limiting 제외
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
