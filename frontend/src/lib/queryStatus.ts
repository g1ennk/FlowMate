import type { FetchStatus } from '@tanstack/react-query'

/**
 * 오프라인이라 조회가 연결을 기다리는 중(fetchStatus 'paused')이고 보여 줄 값도 없는지.
 * 이때는 isLoading도 isError도 아니라서 빈 목록(0건)처럼 그려지기 쉽다. 연결되면 React Query가 저절로 다시 불러온다
 */
export function isWaitingOffline(query: { data: unknown; fetchStatus: FetchStatus }) {
  return query.data === undefined && query.fetchStatus === 'paused'
}
