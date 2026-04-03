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
    if (payload.role !== 'member') {
      throw new UnauthorizedException('Member access required');
    }
    return { userId: payload.sub, role: payload.role };
  }
}
