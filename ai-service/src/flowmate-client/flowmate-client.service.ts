import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FlowmateTodo {
  id: string;
  title: string;
  note: string | null;
  date: string;
  miniDay: number;
  dayOrder: number;
  isDone: boolean;
  sessionCount: number;
  sessionFocusSeconds: number;
  timerMode: string | null;
  reviewRound: number | null;
  originalTodoId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TodoListResponse {
  items: FlowmateTodo[];
}

export interface FlowmateReview {
  id: string;
  type: string;
  periodStart: string;
  content: string;
}

interface ReviewListResponse {
  items: FlowmateReview[];
}

@Injectable()
export class FlowmateClientService {
  private static readonly SPRING_TIMEOUT_MS = 5_000; // Spring API 응답 제한 시간

  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('FLOWMATE_API_URL');
  }

  // URL 구성·Bearer 토큰 주입, 타임아웃, 401 처리를 공통화한 내부 헬퍼
  private async fetchFromSpring(
    path: string,
    params: Record<string, string>,
    token: string,
  ): Promise<Response> {
    const url = `${this.baseUrl}/${path}?${new URLSearchParams(params)}`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FlowmateClientService.SPRING_TIMEOUT_MS),
      });
      if (res.status === 401) {
        throw new UnauthorizedException(
          'Spring returned 401 — token may be expired',
        );
      }
      return res;
    } catch (error) {
      // AbortSignal.timeout() 초과 시 DOMException(AbortError) 발생 — 명시적 504로 변환
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new GatewayTimeoutException('Spring API timeout');
      }
      throw error;
    }
  }

  async fetchTodos(
    token: string,
    from: string,
    to: string,
  ): Promise<FlowmateTodo[]> {
    const res = await this.fetchFromSpring('todos', { from, to }, token);
    // todos 조회 실패는 리포트 생성 불가 — 502로 강하게 처리
    if (!res.ok) {
      throw new BadGatewayException(`Spring API error: ${res.status}`);
    }
    const body = (await res.json()) as TodoListResponse;
    return body.items;
  }

  async fetchReviews(
    token: string,
    type: string,
    from: string,
    to: string,
  ): Promise<FlowmateReview[]> {
    const res = await this.fetchFromSpring(
      'reviews',
      { type, from, to },
      token,
    );
    // 회고 조회 실패 시 빈 배열 반환 — 보조 데이터이므로 리포트 생성을 막지 않음
    if (!res.ok) {
      return [];
    }
    const body = (await res.json()) as ReviewListResponse;
    return body.items;
  }
}
