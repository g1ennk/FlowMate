/**
 * 앱 초기화 중(백엔드 헬스체크, 인증 복원, lazy 청크 로드) 동안 잠깐 노출되는 스플래시.
 * 게이트가 `null`을 반환하던 구간을 대체해 cold load 빈 화면을 없앤다.
 */
function AppSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-base">
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          <span className="text-accent">Flow</span>Mate
        </h1>
        <div
          className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
          aria-hidden
        />
      </div>
    </div>
  )
}

export default AppSplash
