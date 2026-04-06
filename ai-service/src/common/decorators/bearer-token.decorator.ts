import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

// Spring API 호출 시 원본 Bearer 토큰을 그대로 전달해야 하는 컨트롤러에서 사용
export const BearerToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const token =
      request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException();
    return token;
  },
);
