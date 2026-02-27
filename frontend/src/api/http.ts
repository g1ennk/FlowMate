import { z, type ZodSchema } from 'zod'
import { useAuthStore } from '../store/authStore'
import { buildApiUrl } from './baseUrl'

export type ApiError = {
  status: number
  message: string
  fields?: Record<string, string>
}

const ErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
        fields: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    message: z.string().optional(),
  })
  .optional()

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type RequestOptions<T> = Omit<RequestInit, 'body'> & {
  body?: unknown
  schema?: ZodSchema<T>
}

function normalizeBody(body?: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) return body
  return JSON.stringify(body)
}

async function parseError(response: Response): Promise<ApiError> {
  const fallback: ApiError = { status: response.status, message: response.statusText }
  try {
    const data = ErrorSchema.parse(await response.clone().json())
    const message = data?.error?.message ?? data?.message ?? fallback.message
    return { status: response.status, message, fields: data?.error?.fields }
  } catch {
    return fallback
  }
}

export async function http<T>(method: HttpMethod, path: string, options: RequestOptions<T> = {}) {
  const { schema, headers, body, ...rest } = options
  const token = useAuthStore.getState().getToken()

  const response = await fetch(buildApiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...headers,
    },
    credentials: 'include',
    body: normalizeBody(body),
    ...rest,
  })

  // 401 → 토큰 재발급 후 1회 재시도
  if (response.status === 401) {
    const typeBefore = useAuthStore.getState().state?.type
    await useAuthStore.getState().refresh()
    // 회원 세션이 만료되어 refresh 실패 → logout() → 게스트로 전환된 경우
    // 게스트 토큰으로 재시도하면 다른 계정에 데이터가 쓰이므로 에러를 던진다
    if (typeBefore === 'member' && useAuthStore.getState().state?.type !== 'member') {
      throw await parseError(response)
    }
    const retryToken = useAuthStore.getState().getToken()
    const retryResponse = await fetch(buildApiUrl(path), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${retryToken}`,
        ...headers,
      },
      credentials: 'include',
      body: normalizeBody(body),
      ...rest,
    })
    if (!retryResponse.ok) throw await parseError(retryResponse)
    if (schema) return schema.parse(await retryResponse.json())
    return undefined as T
  }

  if (!response.ok) {
    throw await parseError(response)
  }

  if (schema) {
    const json = await response.json()
    return schema.parse(json)
  }

  return undefined as T
}

export const api = {
  get: <T>(path: string, schema?: ZodSchema<T>, init?: RequestInit) =>
    http<T>('GET', path, { schema, ...(init ?? {}) }),
  post: <T>(path: string, body?: unknown, schema?: ZodSchema<T>, init?: RequestInit) =>
    http<T>('POST', path, { body, schema, ...(init ?? {}) }),
  patch: <T>(path: string, body?: unknown, schema?: ZodSchema<T>, init?: RequestInit) =>
    http<T>('PATCH', path, { body, schema, ...(init ?? {}) }),
  put: <T>(path: string, body?: unknown, schema?: ZodSchema<T>, init?: RequestInit) =>
    http<T>('PUT', path, { body, schema, ...(init ?? {}) }),
  delete: <T>(path: string, init?: RequestInit) => http<T>('DELETE', path, { ...(init ?? {}) }),
}
