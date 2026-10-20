import type { RefObject } from 'react'
import { useElementSize, type ElementSize } from '../../lib/useElementSize'

// 로그인 화면에서 미리보기 장면이 쓸 수 있는 크기. 워드마크 묶음 영역(area)의 안쪽 크기에서 워드마크·문장(header) 높이를 뺀다.
// area는 버튼 묶음 위에 남는 높이를 그대로 차지하고(내용 크기로 늘지 않는다), 폭은 버튼과 같은 좌우 여백 안의 폭이다.
// 둘 중 하나라도 아직 재지 못했으면 null이다
export function useLoginPreviewSpace(
  areaRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
): ElementSize | null {
  const area = useElementSize(areaRef)
  const header = useElementSize(headerRef)
  if (!area || !header) return null
  return { width: area.width, height: area.height - header.height }
}
