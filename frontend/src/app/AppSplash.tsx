import { useEffect, useState } from 'react'
import { WordmarkHeader } from '../ui/Wordmark'

// 짧게 끝나는 초기화에서 스피너가 깜빡이지 않도록, 0.5초가 지나도 끝나지 않을 때만 보인다
const SPINNER_DELAY_MS = 500

/**
 * 앱 초기화 중(백엔드 헬스체크, 인증 복원, lazy 청크 로드) 동안 잠깐 노출되는 스플래시.
 * 게이트가 `null`을 반환하던 구간을 대체해 cold load 빈 화면을 없앤다.
 * 워드마크는 로그인 화면과 같은 자리(WordmarkHeader)에 둔다.
 */
function AppSplash() {
  const [showSpinner, setShowSpinner] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <div className="min-h-dvh bg-surface-base">
      <div className="mx-auto w-full max-w-lg">
        <WordmarkHeader>
          {showSpinner && (
            <div
              role="status"
              aria-label="불러오는 중"
              className="mx-auto mt-4 h-5 w-5 animate-spin rounded-full border-2 border-border-default border-t-accent"
            />
          )}
        </WordmarkHeader>
      </div>
    </div>
  )
}

export default AppSplash
