import type { Request } from 'express';

// JwtAuthGuard 통과 후 req.user에 주입되는 타입
export interface AuthenticatedRequest extends Request {
  user: { userId: string };
}
