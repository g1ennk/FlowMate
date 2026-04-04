import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  role: 'guest' | 'member';
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    // Spring 서버와 공유하는 시크릿 키 — hex 문자열로 저장된 값을 바이트 배열로 변환
    const hexSecret = config.getOrThrow<string>('JWT_SECRET');
    const keyBytes = Buffer.from(hexSecret, 'hex');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: keyBytes,
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload) {
    // guest 토큰은 ai-service 접근 불가 - member만 허용
    if (payload.role !== 'member') {
      throw new UnauthorizedException('Member access required');
    }
    return { userId: payload.sub };
  }
}
