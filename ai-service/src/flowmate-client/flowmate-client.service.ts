import {
  BadGatewayException,
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
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('FLOWMATE_API_URL');
  }

  private async fetchFromSpring(
    path: string,
    params: Record<string, string>,
    token: string,
  ): Promise<Response> {
    const url = `${this.baseUrl}/${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401) {
      throw new UnauthorizedException(
        'Spring returned 401 — token may be expired',
      );
    }
    return res;
  }

  async fetchTodos(
    token: string,
    from: string,
    to: string,
  ): Promise<FlowmateTodo[]> {
    const res = await this.fetchFromSpring('todos', { from, to }, token);
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
    if (!res.ok) {
      return []; // 회고 조회 실패는 레포트 생성을 막지 않음
    }
    const body = (await res.json()) as ReviewListResponse;
    return body.items;
  }
}
