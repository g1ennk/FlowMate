/** 쓰던 중 서버 연결이 끊겼을 때 화면을 바꾸지 않고 위에 띄우는 안내 */
function ServerDisconnectedBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-state-error px-4 pb-2 text-center text-xs font-medium text-white"
      style={{ paddingTop: 'calc(var(--safe-top) + 0.5rem)' }}
    >
      서버에 연결할 수 없어요. 다시 연결되면 이어서 쓸 수 있어요
    </div>
  )
}

export default ServerDisconnectedBanner
