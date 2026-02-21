import { z, type ZodSchema } from 'zod'
import { getClientId } from '../lib/clientId'

export type ApiError = {
  status: number
  message: string
  fields?: Record<string, string>
}

function normalizeBaseUrl(value?: string) {
  const fallback = '/api'
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, '')
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/$/, '')
}

const baseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

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

function buildUrl(path: string) {
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
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
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': getClientId(),
      ...headers,
    },
    body: normalizeBody(body),
    ...rest,
  })

  if (!response.ok) {
    throw await parseError(response)
  }

  if (schema) {
    const json = await response.json()
    return schema.parse(json)
  }

  // If caller doesn't need body
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
