import type { KeyboardEvent } from 'react'

// 한글 IME 조합 중 Enter는 글자를 확정하는 키라서 제출로 쓰면 안 된다.
// macOS Safari는 조합을 끝낸 뒤 isComposing=false, keyCode 229로 keydown을 한 번 더 보낸다.
export function isImeComposing(event: KeyboardEvent) {
  return event.nativeEvent.isComposing || event.keyCode === 229
}
