import { onlineManager, QueryClient } from '@tanstack/react-query'

// 401은 http()가 이미 토큰을 새로 받아 한 번 다시 보낸 뒤의 실패다. 여기서 또 재시도하면 같은 요청이 4번 나간다
const isUnauthorized = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 401

// 저장(mutation)은 오프라인이어도 멈춰 두지 않고 바로 보낸다. 보내지 못하면 곧바로 실패해서 롤백과 실패 토스트가 뜨고
// 입력은 남는다. 기본값('online')은 오프라인 저장을 메모리에 멈춰 두었다가 연결되면 말없이 보내서, 배너의
// "지금은 저장되지 않아요"와 어긋나고 그사이 다시 입력한 할 일이 두 번 생긴다. 조회는 기본값대로 연결을 기다린다
export const mutationDefaults = {
  retry: 0,
  networkMode: 'always',
} as const

// onlineManager는 온라인으로 시작해서 오프라인으로 앱을 열어도 다음 online/offline 이벤트 전까지 온라인으로 안다
export function initialOnlineState() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

onlineManager.setOnline(initialOnlineState())

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 1,
      refetchOnWindowFocus: true,
    },
    mutations: mutationDefaults,
  },
})
